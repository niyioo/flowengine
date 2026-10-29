"""
Load a small demo agency: staff, three approval routes and memos in every state.

Dates are relative to today, so the demo always looks current (a memo
"waiting 6 days" is waiting 6 days whenever you run it). Local use only:
refuses to run unless DEBUG is on.

    python manage.py seed_demo            # first time
    python manage.py seed_demo --reset    # wipe the demo data and load it again
"""
from datetime import timedelta
from unittest import mock

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from apps.accounts.models import User, UserRole
from apps.memos import services
from apps.memos.models import Memo, MemoPriority, ReferenceCounter, Route

# Local demo accounts only (see README). Never used outside DEBUG.
DEMO_PASSWORD = "FlowEngine-Demo-2026"
DEMO_EMAIL_DOMAIN = "flowengine.local"

PEOPLE = [
    # username, first, last, role, designation, department
    ("admin", "Amaka", "Eze", UserRole.ADMIN, "ICT Administrator", "ICT"),
    ("dg", "Ibrahim", "Musa", UserRole.STAFF, "Director-General", "Office of the DG"),
    ("dfinance", "Funke", "Adeyemi", UserRole.STAFF, "Director, Finance & Accounts", "Finance & Accounts"),
    ("dadmin", "Chinedu", "Okafor", UserRole.STAFF, "Director, Administration & HR", "Administration & HR"),
    ("hprocurement", "Yusuf", "Bello", UserRole.STAFF, "Head, Procurement Unit", "Procurement"),
    ("hict", "Ngozi", "Obi", UserRole.STAFF, "Head, ICT Unit", "ICT"),
    ("tunde", "Tunde", "Bakare", UserRole.STAFF, "Senior Procurement Officer", "Procurement"),
    ("aisha", "Aisha", "Lawal", UserRole.STAFF, "Accountant II", "Finance & Accounts"),
    ("emeka", "Emeka", "Nwosu", UserRole.STAFF, "Administrative Officer", "Administration & HR"),
    ("auditor", "Grace", "Okon", UserRole.AUDITOR, "Internal Auditor", "Internal Audit"),
]

ROUTES = [
    ("Procurement approval", "Purchases and contracts.",
     [("Unit head review", "hprocurement"), ("Finance review", "dfinance"), ("DG approval", "dg")]),
    ("Staff matters", "Leave, training and other personnel requests.",
     [("Director review", "dadmin"), ("DG approval", "dg")]),
    ("ICT requests", "Equipment, software and connectivity.",
     [("ICT review", "hict"), ("Director approval", "dadmin")]),
]

# (title, originator, route, priority, body, [(days_ago, actor, verb, comment)])
# verbs: create, submit, approve, return, reject, comment
MEMOS = [
    ("Procurement of 20 ergonomic office chairs", "tunde", "Procurement approval", MemoPriority.NORMAL,
     "The chairs in the Procurement and Finance offices are over ten years old and several are broken.\n\n"
     "We request approval to procure 20 ergonomic office chairs through the framework supplier. "
     "Three quotations are attached and the cost is within the approved furniture budget line.",
     [(9, "tunde", "create", ""), (9, "tunde", "submit", ""), (8, "hprocurement", "approve", "Quotations checked."),
      (6, "dfinance", "approve", "Funds are available under the furniture budget line."),
      (5, "auditor", "comment", "Please confirm this purchase is in the approved procurement plan.")]),
    ("Purchase of laptops for the finance team", "aisha", "Procurement approval", MemoPriority.URGENT,
     "Four laptops in the Finance & Accounts department can no longer run the accounting software. "
     "We request approval to replace them before the end-of-quarter closing.",
     [(7, "aisha", "create", ""), (7, "aisha", "submit", ""), (6, "hprocurement", "approve", ""),
      (5, "dfinance", "return", "Attach three quotations and confirm the budget line before this goes to the DG.")]),
    ("Vehicle maintenance for the pool car", "emeka", "Procurement approval", MemoPriority.NORMAL,
     "The pool car is due for its scheduled service and needs two new tyres. "
     "We request approval for the service at the authorised dealer.",
     [(1, "emeka", "create", ""), (1, "emeka", "submit", "")]),
    ("Office cleaning contract extension", "tunde", "Procurement approval", MemoPriority.NORMAL,
     "The cleaning contract ends this month. Performance has been satisfactory and we recommend "
     "extending it for six months on the same terms while a new tender is prepared.",
     [(20, "tunde", "create", ""), (20, "tunde", "submit", ""), (19, "hprocurement", "approve", ""),
      (17, "dfinance", "approve", ""), (15, "dg", "approve", "Approved for six months only.")]),
    ("Request for annual leave: 15 working days", "aisha", "Staff matters", MemoPriority.NORMAL,
     "I request 15 working days of my annual leave entitlement, starting on the first Monday of next month. "
     "My duties will be covered by a colleague in the unit.",
     [(4, "aisha", "create", ""), (4, "aisha", "submit", ""), (3, "dadmin", "approve", ""),
      (2, "dg", "approve", "Approved. Enjoy your leave.")]),
    ("Sponsorship to attend an overseas conference", "emeka", "Staff matters", MemoPriority.NORMAL,
     "I request sponsorship to attend an international records-management conference, "
     "covering registration, travel and accommodation.",
     [(12, "emeka", "create", ""), (12, "emeka", "submit", ""),
      (10, "dadmin", "reject", "This is not in this year's approved training plan. Please apply in the next cycle.")]),
    ("Renewal of the internet bandwidth subscription", "emeka", "ICT requests", MemoPriority.URGENT,
     "The office internet subscription expires next week. We request approval to renew it for 12 months "
     "and to upgrade the bandwidth, as the current link is saturated during working hours.",
     [(2, "emeka", "create", ""), (2, "emeka", "submit", "")]),
    ("Replacement of generator batteries", "tunde", "Procurement approval", MemoPriority.NORMAL,
     "The standby generator failed to start twice last month because of weak batteries. "
     "Draft: quotations still being collected.",
     [(1, "tunde", "create", "")]),
]


class Command(BaseCommand):
    help = "Load demo users, approval routes and memos (local use only)."

    def add_arguments(self, parser):
        parser.add_argument("--reset", action="store_true", help="Delete existing demo data first.")

    def handle(self, *args, reset=False, **options):
        if not settings.DEBUG:
            raise CommandError("seed_demo only runs with DEBUG on. It creates accounts with a published password.")
        demo_users = User.objects.filter(email__endswith=f"@{DEMO_EMAIL_DOMAIN}")
        if demo_users.exists():
            if not reset:
                raise CommandError("Demo data is already loaded. Use --reset to load it again.")
            self._wipe(demo_users)

        with transaction.atomic():
            people = self._people()
            routes = self._routes(people)
            # Oldest first, so reference numbers follow the dates.
            for spec in sorted(MEMOS, key=lambda s: -s[5][0][0]):
                self._memo(spec, people, routes)

        self.stdout.write(self.style.SUCCESS(
            f"Loaded {len(PEOPLE)} users, {len(ROUTES)} routes and {len(MEMOS)} memos. "
            f"Sign in as any of: {', '.join(p[0] for p in PEOPLE)} (password in seed_demo.py)."
        ))

    def _wipe(self, demo_users):
        with transaction.atomic():
            Memo.objects.filter(originator__in=demo_users).delete()
            Route.objects.filter(created_by__in=demo_users).delete()
            ReferenceCounter.objects.all().delete()
            demo_users.delete()

    def _people(self):
        people = {}
        for username, first, last, role, designation, department in PEOPLE:
            user = User(username=username, email=f"{username}@{DEMO_EMAIL_DOMAIN}", first_name=first, last_name=last,
                        role=role, designation=designation, department=department, is_staff=role == UserRole.ADMIN)
            user.set_password(DEMO_PASSWORD)
            user.save()
            people[username] = user
        return people

    def _routes(self, people):
        return {
            name: services.save_route(
                user=people["admin"], name=name, description=description,
                steps=[{"title": title, "approver": people[who]} for title, who in steps],
            )
            for name, description, steps in ROUTES
        }

    def _memo(self, spec, people, routes):
        title, originator, route, priority, body, events = spec
        now = timezone.now()
        memo = None
        for i, (days_ago, actor, verb, comment) in enumerate(events):
            # Each event happens at its own moment in the past (a few minutes
            # apart within a day); services and auto timestamps read timezone.now().
            moment = now - timedelta(days=days_ago, minutes=5 * (len(events) - i))
            with mock.patch("django.utils.timezone.now", return_value=moment):
                user = people[actor]
                if verb == "create":
                    memo = services.create_memo(user=user, title=title, body=body, route=routes[route], priority=priority)
                elif verb == "submit":
                    services.submit_memo(memo, user=user, comment=comment)
                elif verb == "approve":
                    services.approve_memo(memo, user=user, comment=comment)
                elif verb == "return":
                    services.return_memo(memo, user=user, comment=comment)
                elif verb == "reject":
                    services.reject_memo(memo, user=user, comment=comment)
                elif verb == "comment":
                    services.comment_on_memo(memo, user=user, comment=comment)
                memo.refresh_from_db()
