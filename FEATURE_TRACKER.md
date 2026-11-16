# TiffinMate — Feature Tracker

Last updated: 2026-11-16
Policy: A feature moves to **Completed** only after implementation, integration, and successful testing. GitHub code alone means **Testing**, not Completed.
After each feature is verified: change its status, update counts, and suggest the next highest-priority Pending feature.

## Counts
- Completed: 1
- Testing: 16
- In progress: 0
- Pending: 12
- Total tracked: 29

## Completed (1)
- [x] Android preview APK build and backend deployment (both finished/ready on 2026-11-16; device acceptance tests still required for individual features)

## Testing — implemented in code, acceptance tests pending (16)
- [ ] Registration and login
- [ ] Password recovery (requires configured SMTP to verify)
- [ ] Customer management
- [ ] Meal plan creation
- [ ] Customer subscriptions
- [ ] Subscription pause/resume
- [ ] Date-specific meal pauses
- [ ] Subscription calendar
- [ ] Daily kitchen dashboard and lunch/dinner counts
- [ ] Delivery status tracking
- [ ] Manual invoice creation
- [ ] Automatic invoices based on confirmed deliveries
- [ ] Payment recording and outstanding balances
- [ ] Manual WhatsApp payment reminder sharing
- [ ] Monthly business reports
- [ ] Custom Android app icon and navigation

## Pending (12)
- [ ] End-to-end regression testing and release hardening
- [ ] Meal pause cutoff times and consistent billing rules
- [ ] Customer self-service portal
- [ ] Automated WhatsApp reminders (opt-in, provider integration, templates)
- [ ] Subscription expiry and renewal alerts
- [ ] Expense tracking and profit reporting
- [ ] Delivery staff assignment and route management
- [ ] Weekly meal menu planning
- [ ] Customer feedback and ratings
- [ ] Online payment gateway and webhook reconciliation
- [ ] Excel/PDF exports
- [ ] Multi-staff roles and permissions

## WhatsApp feature sub-tracker
- [ ] Manual payment reminder sharing — Testing (implemented)
- [ ] Automatic payment reminders — Pending
- [ ] Subscription renewal WhatsApp reminders — Pending (part of renewal alerts)
- [ ] Delivery notifications — Pending (consider in future scope; not counted separately)
- [ ] Customer opt-in/opt-out and messaging logs — Pending (part of automated WhatsApp reminders)

## Next recommended work
1. End-to-end regression testing on installed APK with backend, including pause-to-kitchen-to-invoice flow.
2. Implement and test meal pause cutoff times and billing rules.
3. Subscription renewal alerts, then WhatsApp automation.

## Release references
- GitHub: https://github.com/agrawal-06/TiffinMate
- EAS Android build: 42092082-0b5a-4e4f-8b7e-c4b2e693d0fe
- Backend Vercel deployment: dpl_MXLqakv9uhSzsQr6PvYdiUYqLbbY
