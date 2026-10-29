from datetime import timedelta

from django.test import override_settings
from django.utils import timezone
from rest_framework import status

from apps.accounts.models import UserRole
from common.testing import APITestBase, make_user

from .models import MemoAction, MemoStatus, MemoStep, StepStatus


class MemoFlowBase(APITestBase):
    """A three-step route: Unit Head → Director → DG, and an originator who is on none of it."""

    def setUp(self):
        super().setUp()
        self.unit_head = make_user(designation="Head, Procurement Unit")
        self.director = make_user(designation="Director, Finance")
        self.dg = make_user(designation="Director-General")
        self.outsider = make_user()
        self.route = self.make_route("Procurement approval", [self.unit_head, self.director, self.dg])

    def make_route(self, name, approvers):
        self.login_as(self.admin)
        response = self.client.post("/api/routes/", {
            "name": name, "description": "", "is_active": True,
            "steps": [{"title": f"Step {i}", "approver": str(a.pk)} for i, a in enumerate(approvers, 1)],
        }, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        return response.data

    def draft(self, user=None, route=None, **extra):
        self.login_as(user or self.staff)
        payload = {"title": "Purchase of office chairs", "body": "We request approval to buy 20 chairs.",
                   "route": (route or self.route)["id"], **extra}
        response = self.client.post("/api/memos/", payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        return response.data

    def act(self, user, memo, verb, comment=None):
        self.login_as(user)
        body = {} if comment is None else {"comment": comment}
        return self.client.post(f"/api/memos/{memo['id']}/{verb}/", body, format="json")

    def submitted(self, **extra):
        memo = self.draft(**extra)
        response = self.act(self.staff, memo, "submit")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        return response.data


class ApprovalFlowTests(MemoFlowBase):
    def test_memo_moves_through_every_step_to_approved(self):
        memo = self.submitted()
        self.assertEqual(memo["status"], MemoStatus.IN_REVIEW)
        self.assertRegex(memo["reference"], r"^FE/\d{4}/00001$")
        self.assertEqual(memo["current_step"]["approver"]["id"], str(self.unit_head.pk))

        for approver in (self.unit_head, self.director):
            memo = self.act(approver, memo, "approve").data
            self.assertEqual(memo["status"], MemoStatus.IN_REVIEW)
        self.assertEqual(memo["current_step"]["approver"]["id"], str(self.dg.pk))

        memo = self.act(self.dg, memo, "approve", "Approved. Proceed.").data
        self.assertEqual(memo["status"], MemoStatus.APPROVED)
        self.assertIsNone(memo["current_step"])
        self.assertIsNotNone(memo["closed_at"])
        self.assertEqual([s["status"] for s in memo["steps"]], [StepStatus.APPROVED] * 3)
        self.assertEqual(
            [a["action"] for a in memo["actions"]],
            ["CREATED", "SUBMITTED", "APPROVED", "APPROVED", "APPROVED"],
        )

    def test_references_increase_per_memo(self):
        first, second = self.submitted(), self.submitted()
        self.assertTrue(first["reference"].endswith("00001"))
        self.assertTrue(second["reference"].endswith("00002"))

    @override_settings(PLATFORM_SETTINGS={**__import__("django.conf").conf.settings.PLATFORM_SETTINGS, "REFERENCE_PREFIX": "NASENI"})
    def test_reference_prefix_comes_from_settings(self):
        self.assertTrue(self.submitted()["reference"].startswith("NASENI/"))

    def test_only_the_current_approver_can_act(self):
        memo = self.submitted()
        for user in (self.director, self.dg, self.staff, self.outsider):
            response = self.act(user, memo, "approve")
            self.assertIn(response.status_code, (status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND), user)
        self.assertEqual(MemoStep.objects.get(memo_id=memo["id"], order=1).status, StepStatus.PENDING)

    def test_return_and_reject_need_a_reason(self):
        memo = self.submitted()
        for verb in ("return", "reject"):
            self.assertEqual(self.act(self.unit_head, memo, verb).status_code, status.HTTP_400_BAD_REQUEST)
            self.assertEqual(self.act(self.unit_head, memo, verb, "no").status_code, status.HTTP_400_BAD_REQUEST)

    def test_returned_memo_is_edited_and_restarts_from_the_first_step(self):
        memo = self.submitted()
        memo = self.act(self.unit_head, memo, "approve").data
        memo = self.act(self.director, memo, "return", "Attach three quotations.").data
        self.assertEqual(memo["status"], MemoStatus.RETURNED)
        self.assertTrue(memo["allowed"]["edit"] is False)  # director's view

        self.login_as(self.staff)
        edited = self.client.patch(f"/api/memos/{memo['id']}/", {"body": "Now with three quotations."}, format="json")
        self.assertEqual(edited.status_code, status.HTTP_200_OK, edited.data)

        memo = self.act(self.staff, memo, "submit", "Quotations attached.").data
        self.assertEqual(memo["status"], MemoStatus.IN_REVIEW)
        self.assertEqual(memo["current_step"]["order"], 1)
        self.assertEqual(memo["reference"].split("/")[-1], "00001")  # keeps its reference
        actions = [a["action"] for a in memo["actions"]]
        self.assertEqual(actions[-3:], ["RETURNED", "EDITED", "RESUBMITTED"])

    def test_rejection_closes_the_memo_and_skips_later_steps(self):
        memo = self.submitted()
        memo = self.act(self.unit_head, memo, "reject", "Not budgeted this year.").data
        self.assertEqual(memo["status"], MemoStatus.REJECTED)
        self.assertEqual([s["status"] for s in memo["steps"]], [StepStatus.REJECTED, StepStatus.SKIPPED, StepStatus.SKIPPED])
        self.assertEqual(self.act(self.director, memo, "approve").status_code, status.HTTP_400_BAD_REQUEST)

    def test_originator_can_withdraw_but_not_edit_in_review(self):
        memo = self.submitted()
        self.login_as(self.staff)
        self.assertEqual(
            self.client.patch(f"/api/memos/{memo['id']}/", {"title": "Changed"}, format="json").status_code,
            status.HTTP_400_BAD_REQUEST,
        )
        memo = self.act(self.staff, memo, "withdraw").data
        self.assertEqual(memo["status"], MemoStatus.WITHDRAWN)
        self.assertEqual(self.act(self.unit_head, memo, "approve").status_code, status.HTTP_400_BAD_REQUEST)

    def test_editing_a_route_does_not_change_memos_in_flight(self):
        memo = self.submitted()
        self.login_as(self.admin)
        response = self.client.put(f"/api/routes/{self.route['id']}/", {
            "name": self.route["name"], "description": "", "is_active": True,
            "steps": [{"title": "Only step", "approver": str(self.outsider.pk)}],
        }, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.login_as(self.unit_head)
        detail = self.client.get(f"/api/memos/{memo['id']}/").data
        self.assertEqual(len(detail["steps"]), 3)
        self.assertEqual(self.act(self.unit_head, memo, "approve").status_code, status.HTTP_200_OK)


class SeparationOfDutiesTests(MemoFlowBase):
    def test_cannot_route_a_memo_through_yourself(self):
        memo = self.draft(user=self.director)
        response = self.act(self.director, memo, "submit")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("route", response.data["errors"] if "errors" in response.data else response.data)

    def test_route_cannot_list_the_same_approver_twice(self):
        self.login_as(self.admin)
        response = self.client.post("/api/routes/", {
            "name": "Loop", "steps": [
                {"title": "A", "approver": str(self.director.pk)},
                {"title": "B", "approver": str(self.director.pk)},
            ],
        }, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_auditors_cannot_be_approvers(self):
        self.login_as(self.admin)
        response = self.client.post("/api/routes/", {
            "name": "Audit sign-off", "steps": [{"title": "Audit", "approver": str(self.auditor.pk)}],
        }, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_approver_who_became_an_auditor_blocks_submission(self):
        memo = self.draft()
        self.director.role = UserRole.AUDITOR
        self.director.save()
        self.assertEqual(self.act(self.staff, memo, "submit").status_code, status.HTTP_400_BAD_REQUEST)

    def test_inactive_approver_blocks_submission(self):
        memo = self.draft()
        self.dg.is_active = False
        self.dg.save()
        self.assertEqual(self.act(self.staff, memo, "submit").status_code, status.HTTP_400_BAD_REQUEST)


class VisibilityTests(MemoFlowBase):
    def test_drafts_are_private_to_their_author(self):
        memo = self.draft()
        for user in (self.unit_head, self.admin, self.auditor, self.outsider):
            self.login_as(user)
            self.assertEqual(self.client.get(f"/api/memos/{memo['id']}/").status_code, status.HTTP_404_NOT_FOUND, user)

    def test_unrelated_staff_cannot_see_a_submitted_memo(self):
        memo = self.submitted()
        self.login_as(self.outsider)
        self.assertEqual(self.client.get(f"/api/memos/{memo['id']}/").status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(self.client.get("/api/memos/").data["count"], 0)

    def test_approvers_see_memos_routed_through_them_even_before_their_turn(self):
        memo = self.submitted()
        self.login_as(self.dg)
        detail = self.client.get(f"/api/memos/{memo['id']}/").data
        self.assertFalse(detail["allowed"]["decide"])
        self.assertEqual(self.client.get("/api/memos/?box=inbox").data["count"], 0)

    def test_inbox_lists_only_memos_waiting_on_me(self):
        self.submitted()
        self.login_as(self.unit_head)
        self.assertEqual(self.client.get("/api/memos/?box=inbox").data["count"], 1)
        self.login_as(self.director)
        self.assertEqual(self.client.get("/api/memos/?box=inbox").data["count"], 0)

    def test_auditor_reads_everything_submitted_but_cannot_create_or_act(self):
        memo = self.submitted()
        self.login_as(self.auditor)
        self.assertEqual(self.client.get(f"/api/memos/{memo['id']}/").status_code, status.HTTP_200_OK)
        response = self.client.post("/api/memos/", {"title": "x", "body": "y", "route": self.route["id"]}, format="json")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(self.act(self.auditor, memo, "approve").status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(self.act(self.auditor, memo, "comment", "Where is the budget line?").status_code, status.HTTP_200_OK)

    def test_only_admins_manage_routes(self):
        self.login_as(self.staff)
        self.assertEqual(self.client.get("/api/routes/").status_code, status.HTTP_200_OK)
        response = self.client.post("/api/routes/", {"name": "Mine", "steps": []}, format="json")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_inactive_routes_cannot_be_chosen(self):
        self.login_as(self.admin)
        self.client.put(f"/api/routes/{self.route['id']}/", {
            "name": self.route["name"], "is_active": False,
            "steps": [{"title": s["title"], "approver": s["approver"]["id"]} for s in self.route["steps"]],
        }, format="json")
        self.login_as(self.staff)
        response = self.client.post("/api/memos/", {"title": "x", "body": "y", "route": self.route["id"]}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class AuditTrailTests(MemoFlowBase):
    def test_comments_are_recorded_and_drafts_cannot_be_commented_on(self):
        memo = self.draft()
        self.assertEqual(self.act(self.staff, memo, "comment", "Note to self").status_code, status.HTTP_400_BAD_REQUEST)
        self.act(self.staff, memo, "submit")
        self.assertEqual(self.act(self.director, memo, "comment", "I will review on Monday.").status_code, status.HTTP_200_OK)
        self.assertTrue(MemoAction.objects.filter(memo_id=memo["id"], action="COMMENTED").exists())

    def test_audit_trail_is_not_exposed_for_editing(self):
        memo = self.submitted()
        self.login_as(self.admin)
        self.assertEqual(self.client.delete(f"/api/memos/{memo['id']}/").status_code, status.HTTP_405_METHOD_NOT_ALLOWED)


class DashboardTests(MemoFlowBase):
    def test_counts_reflect_the_users_work(self):
        waiting = self.submitted()
        self.submitted()
        self.draft()
        MemoStep.objects.filter(memo_id=waiting["id"], order=1).update(received_at=timezone.now() - timedelta(days=10))

        self.login_as(self.unit_head)
        data = self.client.get("/api/dashboard/").data
        self.assertEqual(data["awaiting_me"], 2)
        self.assertEqual(data["awaiting_me_overdue"], 1)
        self.assertEqual(len(data["inbox"]), 2)

        self.login_as(self.staff)
        data = self.client.get("/api/dashboard/").data
        self.assertEqual((data["my_in_review"], data["my_drafts"]), (2, 1))

    def test_oversight_counts_are_only_for_admins_and_auditors(self):
        overdue = self.submitted()
        self.submitted()
        MemoStep.objects.filter(memo_id=overdue["id"], order=1).update(received_at=timezone.now() - timedelta(days=10))
        self.login_as(self.auditor)
        self.assertEqual(self.client.get("/api/dashboard/").data["oversight"], {"in_review": 2, "overdue_steps": 1, "returned": 0})
        self.login_as(self.staff)
        self.assertIsNone(self.client.get("/api/dashboard/").data["oversight"])

    def test_average_approval_time_covers_approved_memos(self):
        memo = self.submitted()
        for approver in (self.unit_head, self.director, self.dg):
            memo = self.act(approver, memo, "approve").data
        self.login_as(self.admin)
        data = self.client.get("/api/dashboard/").data
        self.assertEqual(data["closed"]["approved"], 1)
        self.assertIsNotNone(data["avg_approval_hours"])

    def test_config_serves_limits_and_labels(self):
        self.login_as(self.auditor)
        data = self.client.get("/api/config/").data
        self.assertIn("step_target_days", data)
        self.assertIn({"value": "AUDITOR", "label": "Auditor"}, data["roles"])
        self.assertEqual(data["roles"][0]["value"], UserRole.ADMIN)
