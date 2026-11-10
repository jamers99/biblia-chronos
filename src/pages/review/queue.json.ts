// The review queue's facts, fetched by ReviewQueue.svelte on /review/.
import { reviewQueue } from "../../lib/data/review-queue.ts"

export const GET = () => Response.json(reviewQueue())
