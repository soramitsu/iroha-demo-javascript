<template>
  <ol class="governance-timeline" :aria-label="t('Proposal lifecycle')">
    <li v-for="stage in pipeline" :key="stage.stage" :class="stageClass(stage)">
      <span class="stage-marker" aria-hidden="true"></span>
      <span class="stage-copy">
        <strong>{{ t(stage.stage) }}</strong>
        <small v-if="stage.failure">{{ stage.failure }}</small>
        <small v-else-if="stage.completedAt">
          {{ t("Completed at {height}", { height: stage.completedAt }) }}
        </small>
        <small v-else-if="stage.deadline">
          {{ t("Due by {height}", { height: stage.deadline }) }}
        </small>
        <small v-else>{{ t("Pending") }}</small>
      </span>
    </li>
  </ol>
</template>

<script setup lang="ts">
import { useAppI18n } from "@/composables/useAppI18n";
import type {
  GovernancePipelineStage,
  GovernancePipelineStageName,
} from "@/governance/model";

const props = defineProps<{
  pipeline: GovernancePipelineStage[];
  currentStage: GovernancePipelineStageName;
}>();

const { t } = useAppI18n();

const stageClass = (stage: GovernancePipelineStage) => ({
  complete: Boolean(stage.completedAt),
  current: stage.stage === props.currentStage && !stage.completedAt,
  failed: Boolean(stage.failure),
});
</script>

<style scoped>
.governance-timeline {
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(7, minmax(70px, 1fr));
  list-style: none;
  overflow-x: auto;
}

.governance-timeline li {
  position: relative;
  min-width: 78px;
  padding: 0 8px 0 0;
}

.governance-timeline li::after {
  content: "";
  position: absolute;
  top: 6px;
  right: 0;
  left: 12px;
  height: 1px;
  background: var(--color-border);
}

.governance-timeline li:last-child::after {
  display: none;
}

.stage-marker {
  position: relative;
  z-index: 1;
  width: 13px;
  height: 13px;
  display: block;
  border: 2px solid var(--color-border-strong);
  border-radius: 50%;
  background: var(--color-surface-raised);
}

.stage-copy {
  margin-top: 9px;
  display: grid;
  gap: 3px;
}

.stage-copy strong {
  font-size: 0.69rem;
}

.stage-copy small {
  color: var(--color-text-muted);
  font-size: 0.59rem;
  line-height: 1.35;
}

li.complete .stage-marker {
  border-color: var(--color-success);
  background: var(--color-success);
}

li.current .stage-marker {
  border-color: var(--color-accent);
  background: var(--color-accent);
  box-shadow: 0 0 0 4px var(--color-accent-soft);
}

li.failed .stage-marker {
  border-color: var(--color-danger);
  background: var(--color-danger);
}
</style>
