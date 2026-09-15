import { expect } from 'vitest';
import type { TestUser } from '../../helpers';
import { type ClubSetup, data } from '../memberships/helpers';

export interface Nine {
	id: string;
	name: string;
	sortOrder: number;
	turnMinutes: number;
}

export interface Route {
	id: string;
	name: string;
	nines: [{ id: string; name: string }, { id: string; name: string }];
}

export interface TeeSheetRule {
	dayOfWeek: number;
	firstTee: string;
	lastTee: string;
	intervalMinutes: number;
	maxPlayers: number;
}

export const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];

export async function createNine(
	{ client, slug }: ClubSetup,
	actor: TestUser,
	body: { name: string; sortOrder?: number; turnMinutes?: number },
): Promise<Response> {
	return client.request(`/api/orgs/${slug}/nines`, { method: 'POST', cookie: actor.cookie, json: body });
}

export async function createNineOrFail(setup: ClubSetup, name: string, turnMinutes = 135): Promise<Nine> {
	const response = await createNine(setup, setup.owner, { name, turnMinutes });
	expect(response.status).toBe(201);
	return data<Nine>(response);
}

export async function createRoute(
	{ client, slug }: ClubSetup,
	actor: TestUser,
	body: { name: string; nineIds: string[] },
): Promise<Response> {
	return client.request(`/api/orgs/${slug}/routes`, { method: 'POST', cookie: actor.cookie, json: body });
}

export async function setRules({ client, slug }: ClubSetup, actor: TestUser, nineId: string, rules: TeeSheetRule[]): Promise<Response> {
	return client.request(`/api/orgs/${slug}/nines/${nineId}/tee-sheet-rules`, { method: 'PUT', cookie: actor.cookie, json: { rules } });
}

export function dailyRules(firstTee: string, lastTee: string, intervalMinutes = 10, maxPlayers = 4): TeeSheetRule[] {
	return EVERY_DAY.map((dayOfWeek) => ({ dayOfWeek, firstTee, lastTee, intervalMinutes, maxPlayers }));
}

export async function generateTeeSheet(
	{ client, slug }: ClubSetup,
	actor: TestUser,
	body: { fromDate: string; toDate: string },
): Promise<Response> {
	return client.request(`/api/orgs/${slug}/tee-sheet/generate`, { method: 'POST', cookie: actor.cookie, json: body });
}

export interface TeeSheetTeeTime {
	id: string;
	time: string;
	startsAt: string;
	maxPlayers: number;
	bookedPlayers: number;
	status: 'open' | 'blocked';
	membersOnly: boolean;
}

export interface TeeSheet {
	date: string;
	nines: { id: string; name: string; teeTimes: TeeSheetTeeTime[] }[];
}

export async function viewTeeSheet({ client, slug }: ClubSetup, actor: TestUser, date: string): Promise<Response> {
	return client.request(`/api/orgs/${slug}/tee-sheet?date=${date}`, { cookie: actor.cookie });
}

export async function updateTeeTimes(
	{ client, slug }: ClubSetup,
	actor: TestUser,
	body: { date: string; fromTime: string; toTime: string; nineIds?: string[]; status?: string; membersOnly?: boolean },
): Promise<Response> {
	return client.request(`/api/orgs/${slug}/tee-times`, { method: 'PATCH', cookie: actor.cookie, json: body });
}
