import { describe, expect, it } from "vitest";
import { computed, nextTick, ref } from "vue";
import { useShieldedDestinationLock } from "@/composables/useShieldedDestinationLock";

describe("useShieldedDestinationLock", () => {
  it("locks destination to the active account while shielded", async () => {
    const shielded = ref(false);
    const destination = ref("bob@wonderland");
    const accountId = ref("alice@wonderland");

    const { destinationLocked } = useShieldedDestinationLock({
      shielded,
      destination,
      accountId: computed(() => accountId.value),
    });

    expect(destinationLocked.value).toBe(false);
    expect(destination.value).toBe("bob@wonderland");

    shielded.value = true;
    await nextTick();

    expect(destinationLocked.value).toBe(true);
    expect(destination.value).toBe("alice@wonderland");
  });

  it("restores the prior transparent destination after unshielding", async () => {
    const shielded = ref(false);
    const destination = ref("treasury@wonderland");
    const accountId = ref("alice@wonderland");

    useShieldedDestinationLock({
      shielded,
      destination,
      accountId: computed(() => accountId.value),
    });

    shielded.value = true;
    await nextTick();
    shielded.value = false;
    await nextTick();

    expect(destination.value).toBe("treasury@wonderland");
  });

  it("restores an empty transparent destination after unshielding", async () => {
    const shielded = ref(false);
    const destination = ref("");
    const accountId = ref("alice@wonderland");

    useShieldedDestinationLock({
      shielded,
      destination,
      accountId: computed(() => accountId.value),
    });

    shielded.value = true;
    await nextTick();
    shielded.value = false;
    await nextTick();

    expect(destination.value).toBe("");
  });

  it("tracks transparent destination edits before shielding", async () => {
    const shielded = ref(false);
    const destination = ref("bob@wonderland");
    const accountId = ref("alice@wonderland");

    useShieldedDestinationLock({
      shielded,
      destination,
      accountId: computed(() => accountId.value),
    });

    destination.value = "carol@wonderland";
    await nextTick();
    shielded.value = true;
    await nextTick();
    shielded.value = false;
    await nextTick();

    expect(destination.value).toBe("carol@wonderland");
  });

  it("updates locked destination when the active account changes", async () => {
    const shielded = ref(true);
    const destination = ref("stale@wonderland");
    const accountId = ref("alice@wonderland");

    useShieldedDestinationLock({
      shielded,
      destination,
      accountId: computed(() => accountId.value),
    });

    await nextTick();
    expect(destination.value).toBe("alice@wonderland");

    accountId.value = "dave@wonderland";
    await nextTick();

    expect(destination.value).toBe("dave@wonderland");
  });
});
