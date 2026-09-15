import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest, authRequest } from './api';
import type { Availability, Booking, ClubDetails, MyMembership, Session, Tier } from './types';

export const queryKeys = {
	session: ['session'] as const,
	authOptions: ['auth-options'] as const,
	club: (slug: string) => ['club', slug] as const,
	tiers: (slug: string) => ['club', slug, 'tiers'] as const,
	myMembership: (slug: string) => ['club', slug, 'my-membership'] as const,
	myBookings: (slug: string) => ['club', slug, 'my-bookings'] as const,
	availability: (slug: string, date: string, holes: number, players: number) => ['club', slug, 'availability', date, holes, players] as const,
};

export function useSession() {
	return useQuery({
		queryKey: queryKeys.session,
		queryFn: () => authRequest<Session | null>('/get-session', { method: 'GET' }),
		staleTime: 60_000,
	});
}

export function useAuthOptions() {
	return useQuery({ queryKey: queryKeys.authOptions, queryFn: () => apiRequest<{ google: boolean }>('/auth-options'), staleTime: Infinity });
}

export function useSignOut() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: () => authRequest<unknown>('/sign-out', { body: {} }),
		onSuccess: () => queryClient.clear(),
	});
}

export function useClub(slug: string) {
	return useQuery({ queryKey: queryKeys.club(slug), queryFn: () => apiRequest<ClubDetails>(`/orgs/${encodeURIComponent(slug)}`) });
}

export function useTiers(slug: string) {
	return useQuery({ queryKey: queryKeys.tiers(slug), queryFn: () => apiRequest<Tier[]>(`/orgs/${encodeURIComponent(slug)}/membership-tiers`) });
}

export function useMyMembership(slug: string, isSignedIn: boolean) {
	return useQuery({
		queryKey: queryKeys.myMembership(slug),
		queryFn: () => apiRequest<MyMembership>(`/orgs/${encodeURIComponent(slug)}/memberships/me`),
		enabled: isSignedIn,
	});
}

export function useAvailability(slug: string, date: string, holes: 9 | 18, players: number) {
	return useQuery({
		queryKey: queryKeys.availability(slug, date, holes, players),
		queryFn: ({ signal }) => {
			const params = new URLSearchParams({ date, holes: String(holes), players: String(players) });
			return apiRequest<Availability>(`/orgs/${encodeURIComponent(slug)}/availability?${params}`, { signal });
		},
	});
}

export function useMyBookings(slug: string) {
	return useQuery({ queryKey: queryKeys.myBookings(slug), queryFn: () => apiRequest<Booking[]>(`/orgs/${encodeURIComponent(slug)}/bookings/mine`) });
}

export interface BookingRequest {
	holes: 9 | 18;
	teeTimeId: string;
	routeId?: string;
	guests: { name: string }[];
}

export function useCreateBooking(slug: string) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (request: BookingRequest) => apiRequest<Booking>(`/orgs/${encodeURIComponent(slug)}/bookings`, { method: 'POST', body: request }),
		onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.club(slug) }),
	});
}

export function useCancelBooking(slug: string) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (bookingId: string) => apiRequest<Booking>(`/orgs/${encodeURIComponent(slug)}/bookings/${bookingId}/cancel`, { method: 'POST' }),
		onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.club(slug) }),
	});
}

export function useRequestMembership(slug: string) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (request: { requestedTierId?: string; note?: string }) =>
			apiRequest<unknown>(`/orgs/${encodeURIComponent(slug)}/membership-requests`, { method: 'POST', body: request }),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.myMembership(slug) }),
	});
}
