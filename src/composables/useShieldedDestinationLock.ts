import { computed, ref, watch, type Ref } from "vue";

interface UseShieldedDestinationLockInput {
  shielded: Ref<boolean>;
  destination: Ref<string>;
  accountId: Ref<string | null | undefined>;
}

export const useShieldedDestinationLock = ({
  shielded,
  destination,
  accountId,
}: UseShieldedDestinationLockInput) => {
  const lastTransparentDestination = ref("");

  const destinationLocked = computed(
    () => shielded.value && Boolean(accountId.value),
  );

  watch(
    () => [shielded.value, accountId.value] as const,
    ([nextShielded, nextAccountId], previous) => {
      const previousShielded = previous?.[0];
      if (nextShielded && nextAccountId) {
        if (!previousShielded) {
          lastTransparentDestination.value = destination.value;
        }
        destination.value = nextAccountId;
        return;
      }
      if (!nextShielded && previousShielded) {
        destination.value = lastTransparentDestination.value;
      }
    },
    { immediate: true },
  );

  watch(
    () => destination.value,
    (value) => {
      if (!shielded.value) {
        lastTransparentDestination.value = value;
      }
    },
  );

  return {
    destinationLocked,
  };
};
