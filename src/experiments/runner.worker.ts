import {
  runPair,
  validateBatch,
  type BatchRequest,
  type BatchMessage,
  type PairedRun,
} from "./runner";

self.onmessage = (event: MessageEvent<BatchRequest>) => {
  const post = (message: BatchMessage) => self.postMessage(message);
  try {
    const request = event.data;
    validateBatch(request);
    const pairs: PairedRun[] = [];
    for (let run = 0; run < request.runs; run++) {
      pairs.push(runPair(request, request.firstSeed + run));
      post({ type: "progress", completed: pairs.length, total: request.runs });
    }
    post({ type: "done", result: { request, pairs } });
  } catch (error) {
    post({
      type: "error",
      message: error instanceof Error ? error.message : "Experiment failed.",
    });
  }
};
