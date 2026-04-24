import {
  BrowserMultiFormatReader,
  type IScannerControls,
} from "@zxing/browser";
import { nextTick, onBeforeUnmount, ref } from "vue";
import { toUserFacingErrorMessage } from "@/utils/errorMessage";

type Decoder = (payload: string) => void;
type Translate = (key: string) => string;

type UseQrScannerOptions = {
  translate?: Translate;
};

export const useQrScanner = (
  onDecoded: Decoder,
  options: UseQrScannerOptions = {},
) => {
  const t: Translate = options.translate ?? ((key) => key);
  const reader = new BrowserMultiFormatReader();
  const scanning = ref(false);
  const message = ref("");
  const videoRef = ref<HTMLVideoElement | null>(null);
  const fileInputRef = ref<HTMLInputElement | null>(null);
  let controls: IScannerControls | null = null;
  let scannerRunId = 0;

  const cameraConstraints: MediaStreamConstraints = {
    video: {
      facingMode: { ideal: "environment" },
      width: { ideal: 1280 },
      height: { ideal: 720 },
    },
    audio: false,
  };

  const isTransientDecodeError = (error: unknown) => {
    const name = String((error as Error | undefined)?.name ?? "");
    return (
      name === "NotFoundException" ||
      name === "ChecksumException" ||
      name === "FormatException"
    );
  };

  const stop = () => {
    scannerRunId += 1;
    scanning.value = false;
    controls?.stop();
    controls = null;
    if (videoRef.value) {
      videoRef.value.srcObject = null;
    }
  };

  const start = async () => {
    if (scanning.value) {
      stop();
      return;
    }
    scanning.value = true;
    message.value = "";
    const runId = ++scannerRunId;
    await nextTick();
    if (runId !== scannerRunId) {
      return;
    }
    const videoEl = videoRef.value;
    if (!videoEl) {
      scanning.value = false;
      message.value = t("Camera preview is not ready.");
      return;
    }
    try {
      let shouldStop = false;
      let scannerControls: IScannerControls | null = null;
      const requestStop = () => {
        shouldStop = true;
        if (scannerControls) {
          controls = scannerControls;
          stop();
        }
      };
      scannerControls = await reader.decodeFromConstraints(
        cameraConstraints,
        videoEl,
        (result, error) => {
          if (runId !== scannerRunId) {
            requestStop();
            return;
          }
          if (result) {
            onDecoded(result.getText());
            message.value = t("QR decoded successfully.");
            requestStop();
          } else if (error && !isTransientDecodeError(error)) {
            message.value = toUserFacingErrorMessage(error, t("Camera error."));
            requestStop();
          }
        },
      );
      controls = scannerControls;
      if (runId !== scannerRunId || shouldStop) {
        stop();
      }
    } catch (error) {
      scanning.value = false;
      message.value = toUserFacingErrorMessage(
        error,
        t("Unable to start scanner."),
      );
    }
  };

  const openFilePicker = () => fileInputRef.value?.click();

  const decodeFile = async (event: Event) => {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    message.value = t("Processing image...");
    try {
      const result = await reader.decodeFromImageUrl(url);
      if (result) {
        onDecoded(result.getText());
        message.value = t("QR decoded successfully.");
      } else {
        message.value = t("Unable to read QR from image.");
      }
    } catch (error) {
      message.value = toUserFacingErrorMessage(
        error,
        t("Unable to decode the selected image."),
      );
    } finally {
      URL.revokeObjectURL(url);
      target.value = "";
    }
  };

  onBeforeUnmount(stop);

  return {
    scanning,
    message,
    videoRef,
    fileInputRef,
    start,
    stop,
    openFilePicker,
    decodeFile,
  };
};
