import type { RouteObject } from 'react-router';
import { AccountPage } from './features/auth/AccountPage';
import { ForgotPasswordPage } from './features/auth/ForgotPasswordPage';
import { ResetPasswordPage } from './features/auth/ResetPasswordPage';
import { SignInPage } from './features/auth/SignInPage';
import { SignUpPage } from './features/auth/SignUpPage';
import { VerifyEmailPage } from './features/auth/VerifyEmailPage';
import { BookPage } from './features/booking/BookPage';
import { MyBookingsPage } from './features/booking/MyBookingsPage';
import { ClubHomePage } from './features/clubs/ClubHomePage';
import { HomePage } from './features/clubs/HomePage';
import { AcceptInvitePage } from './features/invites/AcceptInvitePage';
import { MembershipPage } from './features/membership/MembershipPage';
import { NotFoundPage } from './features/NotFoundPage';
import { ClubLayout } from './layouts/ClubLayout';

export const routes: RouteObject[] = [
	{ path: '/', element: <HomePage /> },
	{ path: '/sign-in', element: <SignInPage /> },
	{ path: '/sign-up', element: <SignUpPage /> },
	{ path: '/verify-email', element: <VerifyEmailPage /> },
	{ path: '/forgot-password', element: <ForgotPasswordPage /> },
	{ path: '/reset-password', element: <ResetPasswordPage /> },
	{ path: '/account', element: <AccountPage /> },
	{ path: '/invites/accept', element: <AcceptInvitePage kind="staff" /> },
	{ path: '/membership-invites/accept', element: <AcceptInvitePage kind="membership" /> },
	{
		path: '/c/:slug',
		element: <ClubLayout />,
		children: [
			{ index: true, element: <ClubHomePage /> },
			{ path: 'book', element: <BookPage /> },
			{ path: 'bookings', element: <MyBookingsPage /> },
			{ path: 'membership', element: <MembershipPage /> },
		],
	},
	{ path: '*', element: <NotFoundPage /> },
];
