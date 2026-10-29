from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import DashboardView, MemoViewSet, PlatformConfigView, RouteViewSet

router = DefaultRouter()
router.register("memos", MemoViewSet, basename="memo")
router.register("routes", RouteViewSet, basename="route")

urlpatterns = [
    path("dashboard/", DashboardView.as_view(), name="dashboard"),
    path("config/", PlatformConfigView.as_view(), name="platform-config"),
    path("", include(router.urls)),
]
