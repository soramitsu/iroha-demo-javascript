import { defineStore } from "pinia";
import { inspectEndpoint } from "@/services/iroha";
import type {
  EndpointAccessMode,
  EndpointInspection,
  EndpointInspectionState,
  EndpointNetworkContext,
} from "@/types/endpointInspection";

type EndpointStoreState = {
  state: EndpointInspectionState;
  inspection: EndpointInspection | null;
  error: string;
  generation: number;
};

const initialState = (): EndpointStoreState => ({
  state: "idle",
  inspection: null,
  error: "",
  generation: 0,
});

export const useEndpointStore = defineStore("endpoint", {
  state: initialState,
  getters: {
    accessMode: (state): EndpointAccessMode | null =>
      state.inspection?.accessMode ?? null,
    writeAllowed: (state): boolean =>
      state.inspection?.accessMode === "read-write",
    degraded: (state): boolean =>
      state.state === "ready" &&
      (state.error !== "" || state.inspection?.accessMode !== "read-write"),
    diagnostic: (state): string =>
      state.inspection?.diagnostic.message || state.error,
  },
  actions: {
    invalidate() {
      this.generation += 1;
      this.state = "idle";
      this.inspection = null;
      this.error = "";
    },
    adoptInspection(inspection: EndpointInspection) {
      this.generation += 1;
      this.state = "ready";
      this.inspection = inspection;
      this.error = "";
    },
    async inspect(input: EndpointNetworkContext) {
      const generation = this.generation + 1;
      this.generation = generation;
      this.state = "checking";
      this.inspection = null;
      this.error = "";
      try {
        const inspection = await inspectEndpoint(input);
        if (generation !== this.generation) {
          return null;
        }
        this.inspection = inspection;
        this.state = "ready";
        return inspection;
      } catch (error) {
        if (generation !== this.generation) {
          return null;
        }
        this.error =
          error instanceof Error
            ? error.message
            : "Endpoint identity inspection failed.";
        this.state = "ready";
        return null;
      }
    },
  },
});
