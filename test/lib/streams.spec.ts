import { describe, expect, it } from 'vitest';
import { readBodyWithLimit } from '../../src/lib/streams';

function streamOf(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
	return new ReadableStream({
		start(controller) {
			for (const chunk of chunks) controller.enqueue(chunk);
			controller.close();
		},
	});
}

describe('readBodyWithLimit', () => {
	it('joins chunks up to the limit', async () => {
		const bytes = await readBodyWithLimit(streamOf([new Uint8Array([1, 2]), new Uint8Array([3])]), 3);

		expect(bytes).toEqual(new Uint8Array([1, 2, 3]));
	});

	it('treats a missing body as empty', async () => {
		expect(await readBodyWithLimit(null, 10)).toEqual(new Uint8Array());
	});

	it('stops reading and cancels the stream once the limit is passed', async () => {
		let pulls = 0;
		let cancelled = false;
		const endless = new ReadableStream<Uint8Array>({
			pull(controller) {
				pulls++;
				controller.enqueue(new Uint8Array(1024));
			},
			cancel() {
				cancelled = true;
			},
		});

		expect(await readBodyWithLimit(endless, 4096)).toBeNull();
		expect(cancelled).toBe(true);
		expect(pulls).toBeLessThan(10);
	});
});
