import { useEffect, useRef, useState } from "react";
import {
  Html5Qrcode,
  Html5QrcodeSupportedFormats,
  type CameraDevice,
} from "html5-qrcode";
import { FlipHorizontal } from "lucide-react";

// Only the barcode formats that appear on food packaging
const FOOD_FORMATS = [
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.UPC_E,
  Html5QrcodeSupportedFormats.CODE_128,
  Html5QrcodeSupportedFormats.CODE_39,
  Html5QrcodeSupportedFormats.ITF,
];

interface ScannerProps {
  onScan: (decodedText: string) => void;
}

type FacingMode = "environment" | "user";

export function Scanner({ onScan }: ScannerProps) {
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const isStarted = useRef(false);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  // "environment" = rear camera (preferred); "user" = front camera
  const [facingMode, setFacingMode] = useState<FacingMode>("environment");
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const elementId = "barcode-reader";

  // Check whether a front camera exists so we can show the flip button
  useEffect(() => {
    Html5Qrcode.getCameras()
      .then((devices: CameraDevice[]) => {
        setHasMultipleCameras(devices.length > 1);
      })
      .catch(() => {
        // Ignore — camera permission prompt may not have fired yet
      });
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function startScanner() {
      // Tear down any running instance first
      if (html5QrCodeRef.current && isStarted.current) {
        await html5QrCodeRef.current.stop().catch(() => {});
        html5QrCodeRef.current.clear();
        isStarted.current = false;
      }

      if (cancelled) return;

      html5QrCodeRef.current = new Html5Qrcode(elementId, {
        formatsToSupport: FOOD_FORMATS,
        verbose: false,
      });

      try {
        // Pass the facingMode *object* — this is the iOS-safe approach.
        // Passing a device ID string is unreliable on Safari/iOS.
        await html5QrCodeRef.current.start(
          { facingMode },
          {
            fps: 15,            // Higher fps → faster autofocus-triggered recognition
            qrbox: { width: 280, height: 160 }, // Wider to fit landscape barcodes
            aspectRatio: 1.777, // 16:9 matches iPhone rear camera native ratio
            disableFlip: false, // Allow mirrored barcodes
          },
          (decodedText) => {
            if (html5QrCodeRef.current && isStarted.current) {
              html5QrCodeRef.current.stop().catch(() => {});
              isStarted.current = false;
            }
            onScanRef.current(decodedText);
          },
          () => {
            // Per-frame decode errors are normal — ignore them
          }
        );
        if (!cancelled) {
          isStarted.current = true;
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          const msg =
            err instanceof Error ? err.message : String(err);
          if (/permission/i.test(msg)) {
            setError("Camera permission denied. Please allow access in your browser settings.");
          } else if (/not found|no.*camera/i.test(msg)) {
            setError("No camera found. Make sure you're on a device with a camera.");
          } else {
            setError("Could not start camera. Try reloading or check permissions.");
          }
        }
      }
    }

    startScanner();

    return () => {
      cancelled = true;
      if (html5QrCodeRef.current && isStarted.current) {
        html5QrCodeRef.current.stop().catch(() => {});
        isStarted.current = false;
      }
    };
  }, [facingMode]); // Restart whenever facing mode changes

  return (
    <div className="w-full max-w-sm mx-auto space-y-2">
      <div className="relative overflow-hidden rounded-3xl bg-black border-2 border-foreground shadow-[4px_4px_0_0_hsl(var(--foreground))]">
        {error ? (
          <div className="flex items-center justify-center h-48 text-sm text-muted-foreground px-6 text-center bg-card">
            {error}
          </div>
        ) : (
          <div id={elementId} className="w-full" />
        )}

        {/* Flip camera button — shown only when multiple cameras exist */}
        {hasMultipleCameras && !error && (
          <button
            onClick={() =>
              setFacingMode((prev) => (prev === "environment" ? "user" : "environment"))
            }
            className="absolute top-3 right-3 z-10 bg-black/50 backdrop-blur-sm text-white rounded-full p-2 hover:bg-black/70 transition-colors"
            title="Flip camera"
          >
            <FlipHorizontal className="w-5 h-5" />
          </button>
        )}
      </div>

      <p className="text-xs text-center text-muted-foreground font-medium px-2">
        Hold steady — keep the barcode within the frame
      </p>
    </div>
  );
}
