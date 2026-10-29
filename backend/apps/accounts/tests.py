from django.conf import settings
from django.test import override_settings
from rest_framework import status
from rest_framework_simplejwt.tokens import AccessToken

from common.testing import PASSWORD, APITestBase, make_user

from .models import User, UserRole


COOKIE = settings.AUTH_COOKIE["NAME"]


class LoginTests(APITestBase):
    def login(self, username, password=PASSWORD, **extra):
        return self.client.post("/api/auth/login/", {"username": username, "password": password}, format="json", **extra)

    def test_login_returns_access_token_and_sets_httponly_refresh_cookie(self):
        response = self.login(self.staff.username)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(AccessToken(response.data["access"])["role"], UserRole.STAFF)
        self.assertNotIn("refresh", response.data)  # never readable by JavaScript

        cookie = response.cookies[COOKIE]
        self.assertTrue(cookie["httponly"])
        self.assertTrue(cookie["secure"])
        self.assertEqual(cookie["samesite"], "Strict")
        self.assertEqual(cookie["path"], "/api/auth/")

    def test_wrong_password_returns_401_in_standard_envelope(self):
        response = self.login(self.staff.username, "wrong-password")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertTrue(response.data["error"])
        self.assertNotIn(COOKIE, response.cookies)

    def test_inactive_user_cannot_login(self):
        self.staff.is_active = False
        self.staff.save()
        self.assertEqual(self.login(self.staff.username).status_code, status.HTTP_401_UNAUTHORIZED)

    def test_form_encoded_login_rejected(self):
        response = self.client.post("/api/auth/login/", {"username": self.staff.username, "password": PASSWORD})
        self.assertEqual(response.status_code, status.HTTP_415_UNSUPPORTED_MEDIA_TYPE)

    def test_brute_force_is_throttled_per_username(self):
        for _ in range(5):
            self.login(self.staff.username, "wrong-password")
        self.assertEqual(self.login(self.staff.username, "wrong-password").status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        # A colleague behind the same office IP is not locked out.
        self.assertEqual(self.login(self.auditor.username).status_code, status.HTTP_200_OK)

    @override_settings(REST_FRAMEWORK={**settings.REST_FRAMEWORK, "NUM_PROXIES": 1})
    def test_throttle_uses_forwarded_client_ip_behind_proxy(self):
        proxy = {"REMOTE_ADDR": "10.0.0.2"}  # every request arrives from nginx
        for _ in range(5):
            self.login(self.staff.username, "bad", HTTP_X_FORWARDED_FOR="203.0.113.7", **proxy)
        blocked = self.login(self.staff.username, PASSWORD, HTTP_X_FORWARDED_FOR="203.0.113.7", **proxy)
        other_client = self.login(self.staff.username, PASSWORD, HTTP_X_FORWARDED_FOR="198.51.100.9", **proxy)
        self.assertEqual(blocked.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        self.assertEqual(other_client.status_code, status.HTTP_200_OK)


class TokenLifecycleTests(APITestBase):
    def sign_in(self, user):
        """Logs in; the test client keeps the refresh cookie like a browser would."""
        response = self.client.post("/api/auth/login/", {"username": user.username, "password": PASSWORD}, format="json")
        return response.cookies[COOKIE].value

    def refresh(self):
        return self.client.post("/api/auth/refresh/", {}, format="json")

    def test_refresh_uses_cookie_and_rotates_it(self):
        original = self.sign_in(self.staff)
        response = self.refresh()
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data)
        self.assertNotIn("refresh", response.data)
        self.assertNotEqual(response.cookies[COOKIE].value, original)

        # Replaying the pre-rotation cookie (e.g. a stolen copy) fails and clears it.
        self.client.cookies[COOKIE] = original
        replay = self.refresh()
        self.assertEqual(replay.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(replay.cookies[COOKIE].value, "")

    def test_refresh_without_session(self):
        response = self.refresh()
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(response.data["code"], "no_session")

    def test_refresh_requires_json_body(self):
        self.sign_in(self.staff)
        self.assertEqual(self.client.post("/api/auth/refresh/").status_code, status.HTTP_415_UNSUPPORTED_MEDIA_TYPE)

    def test_refresh_rejected_after_deactivation(self):
        self.sign_in(self.staff)
        self.staff.is_active = False
        self.staff.save()
        self.assertEqual(self.refresh().status_code, status.HTTP_401_UNAUTHORIZED)

    def test_logout_revokes_session_and_clears_cookie(self):
        token = self.sign_in(self.staff)
        response = self.client.post("/api/auth/logout/", {}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.cookies[COOKIE].value, "")
        self.client.cookies[COOKIE] = token  # even if the cookie were kept, it is dead
        self.assertEqual(self.refresh().status_code, status.HTTP_401_UNAUTHORIZED)

    def test_logout_is_idempotent_without_session(self):
        self.assertEqual(self.client.post("/api/auth/logout/", {}, format="json").status_code, 200)

    def test_me_requires_authentication(self):
        self.assertEqual(self.client.get("/api/auth/me/").status_code, status.HTTP_401_UNAUTHORIZED)
        self.login_as(self.staff)
        self.assertEqual(self.client.get("/api/auth/me/").data["username"], self.staff.username)


class UserManagementTests(APITestBase):
    def test_only_admins_manage_users(self):
        for user in (self.staff, self.auditor):
            self.login_as(user)
            self.assertEqual(self.client.get("/api/users/").status_code, status.HTTP_403_FORBIDDEN)
        self.login_as(self.admin)
        self.assertEqual(self.client.get("/api/users/").status_code, status.HTTP_200_OK)

    def test_weak_password_rejected(self):
        self.login_as(self.admin)
        response = self.client.post("/api/users/", {
            "username": "newbie", "email": "newbie@example.com", "password": "12345678", "role": "STAFF",
        }, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["code"], "validation_error")
        self.assertIn("password", response.data["errors"])  # shown inline under the field

    def test_admin_cannot_change_own_role(self):
        self.login_as(self.admin)
        response = self.client.patch(f"/api/users/{self.admin.pk}/", {"role": "STAFF"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_admin_can_demote_another_admin(self):
        other_admin = make_user(UserRole.ADMIN)
        self.login_as(other_admin)
        response = self.client.patch(f"/api/users/{self.admin.pk}/", {"role": "AUDITOR"}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertFalse(User.objects.get(pk=self.admin.pk).is_staff)

    def test_admin_cannot_deactivate_self(self):
        self.login_as(self.admin)
        self.assertEqual(self.client.delete(f"/api/users/{self.admin.pk}/").status_code, 400)
        self.assertEqual(self.client.patch(f"/api/users/{self.admin.pk}/", {"is_active": False}, format="json").status_code, 400)

    def test_delete_deactivates_and_revokes_sessions(self):
        self.client.post("/api/auth/login/", {"username": self.staff.username, "password": PASSWORD}, format="json")
        session_cookie = self.client.cookies[COOKIE].value
        self.login_as(self.admin)
        self.assertEqual(self.client.delete(f"/api/users/{self.staff.pk}/").status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(User.objects.get(pk=self.staff.pk).is_active)
        self.client.force_authenticate(None)
        self.client.cookies[COOKIE] = session_cookie
        self.assertEqual(self.client.post("/api/auth/refresh/", {}, format="json").status_code, 401)

    def test_reactivate_user(self):
        self.staff.is_active = False
        self.staff.save()
        self.login_as(self.admin)
        response = self.client.patch(f"/api/users/{self.staff.pk}/", {"is_active": True}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(User.objects.get(pk=self.staff.pk).is_active)

    def test_createsuperuser_gets_admin_role(self):
        user = User.objects.create_superuser("root_admin", "root@example.com", PASSWORD)
        self.assertEqual(user.role, UserRole.ADMIN)


class PlatformTests(APITestBase):
    @override_settings(ALLOWED_HOSTS=["flowengine.example.com"], SECURE_SSL_REDIRECT=True)
    def test_health_check_bypasses_host_validation_and_ssl_redirect(self):
        response = self.client.get("/health/", HTTP_HOST="localhost:8000")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok", "db": "connected"})

    def test_api_schema_requires_authentication(self):
        self.assertEqual(self.client.get("/api/schema/").status_code, status.HTTP_401_UNAUTHORIZED)

    def test_unknown_error_shape_is_consistent_for_404(self):
        self.login_as(self.staff)
        response = self.client.get("/api/memos/00000000-0000-0000-0000-000000000000/")
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.data["code"], "not_found")
