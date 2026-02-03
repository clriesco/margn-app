import React, { useState, useRef, useCallback } from "react";
import Cropper, { Area } from "react-easy-crop";
import { Camera, Loader2, X, ZoomIn, ZoomOut, Check } from "lucide-react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";

interface AvatarUploadProps {
  currentAvatarUrl?: string | null;
  onUploadComplete: (url: string | null) => void;
  size?: number;
}

// Output size for compressed avatar (pixels)
const OUTPUT_SIZE = 256;
// JPEG quality (0-1)
const COMPRESSION_QUALITY = 0.85;

/**
 * Create a cropped and compressed image from the source
 */
async function getCroppedImg(
  imageSrc: string,
  pixelCrop: Area
): Promise<Blob> {
  const image = new Image();
  image.src = imageSrc;

  await new Promise((resolve) => {
    image.onload = resolve;
  });

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    throw new Error("Could not get canvas context");
  }

  // Set canvas size to output size
  canvas.width = OUTPUT_SIZE;
  canvas.height = OUTPUT_SIZE;

  // Draw the cropped area scaled to output size
  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    OUTPUT_SIZE,
    OUTPUT_SIZE
  );

  // Convert to blob with compression
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error("Failed to create blob"));
        }
      },
      "image/jpeg",
      COMPRESSION_QUALITY
    );
  });
}

export default function AvatarUpload({
  currentAvatarUrl,
  onUploadComplete,
  size = 96,
}: AvatarUploadProps) {
  const { user } = useAuth();
  const userId = user?.id || "";

  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentAvatarUrl || null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Cropper state
  const [showCropper, setShowCropper] = useState(false);
  const [imageToCrop, setImageToCrop] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);

  const onCropComplete = useCallback((_croppedArea: Area, croppedAreaPixels: Area) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!userId) {
      setError("Debes iniciar sesión para subir una imagen");
      return;
    }

    // Validate file type
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Solo se permiten imágenes JPG, PNG o WebP");
      return;
    }

    // Validate file size (10MB max for source - will be compressed)
    if (file.size > 10 * 1024 * 1024) {
      setError("La imagen no puede superar 10MB");
      return;
    }

    setError(null);

    // Create object URL and show cropper
    const objectUrl = URL.createObjectURL(file);
    setImageToCrop(objectUrl);
    setShowCropper(true);
    setCrop({ x: 0, y: 0 });
    setZoom(1);

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleCropConfirm = async () => {
    if (!imageToCrop || !croppedAreaPixels) return;

    setUploading(true);
    setError(null);

    try {
      // Get cropped and compressed image
      const croppedBlob = await getCroppedImg(imageToCrop, croppedAreaPixels);

      // Create preview from blob
      const croppedUrl = URL.createObjectURL(croppedBlob);
      setPreviewUrl(croppedUrl);
      setShowCropper(false);

      // Upload to Supabase Storage
      const filePath = `${userId}/avatar.jpg`;

      // Delete existing avatars first
      await supabase.storage.from("avatars").remove([
        `${userId}/avatar.jpg`,
        `${userId}/avatar.png`,
        `${userId}/avatar.webp`,
      ]);

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(filePath, croppedBlob, {
          cacheControl: "3600",
          upsert: true,
          contentType: "image/jpeg",
        });

      if (uploadError) {
        throw uploadError;
      }

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from("avatars")
        .getPublicUrl(filePath);

      // Add cache buster
      const urlWithCacheBuster = `${publicUrl}?t=${Date.now()}`;

      onUploadComplete(urlWithCacheBuster);
      setPreviewUrl(urlWithCacheBuster);

      // Cleanup
      URL.revokeObjectURL(imageToCrop);
    } catch (err) {
      console.error("Error uploading avatar:", err);
      setError("Error al subir la imagen. Inténtalo de nuevo.");
      setPreviewUrl(currentAvatarUrl || null);
    } finally {
      setUploading(false);
    }
  };

  const handleCropCancel = () => {
    if (imageToCrop) {
      URL.revokeObjectURL(imageToCrop);
    }
    setShowCropper(false);
    setImageToCrop(null);
  };

  const handleRemoveAvatar = async () => {
    setUploading(true);
    setError(null);

    try {
      await supabase.storage
        .from("avatars")
        .remove([
          `${userId}/avatar.jpg`,
          `${userId}/avatar.png`,
          `${userId}/avatar.webp`,
        ]);

      setPreviewUrl(null);
      onUploadComplete(null);
    } catch (err) {
      console.error("Error removing avatar:", err);
      setError("Error al eliminar la imagen");
    } finally {
      setUploading(false);
    }
  };

  const getInitials = () => {
    return "?";
  };

  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1rem" }}>
        {/* Avatar preview */}
        <div style={{ position: "relative", width: size, height: size }}>
          <div
            style={{
              width: size,
              height: size,
              borderRadius: "50%",
              background: previewUrl
                ? `url(${previewUrl}) center/cover no-repeat`
                : "linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "white",
              fontSize: size * 0.35,
              fontWeight: "600",
              border: "3px solid var(--border)",
              overflow: "hidden",
            }}
          >
            {!previewUrl && getInitials()}
            {uploading && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background: "rgba(0, 0, 0, 0.5)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: "50%",
                }}
              >
                <Loader2 size={size * 0.3} style={{ animation: "spin 1s linear infinite" }} />
              </div>
            )}
          </div>

          {/* Upload button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            style={{
              position: "absolute",
              bottom: 0,
              right: 0,
              width: size * 0.35,
              height: size * 0.35,
              borderRadius: "50%",
              background: "var(--accent-blue)",
              border: "2px solid var(--bg-card)",
              color: "white",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: uploading ? "not-allowed" : "pointer",
              transition: "transform 0.2s, background 0.2s",
            }}
            onMouseEnter={(e) => {
              if (!uploading) {
                e.currentTarget.style.transform = "scale(1.1)";
                e.currentTarget.style.background = "#2563eb";
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "scale(1)";
              e.currentTarget.style.background = "var(--accent-blue)";
            }}
          >
            <Camera size={size * 0.15} />
          </button>

          {/* Remove button */}
          {previewUrl && !uploading && (
            <button
              onClick={handleRemoveAvatar}
              style={{
                position: "absolute",
                top: 0,
                right: 0,
                width: size * 0.28,
                height: size * 0.28,
                borderRadius: "50%",
                background: "var(--accent-red)",
                border: "2px solid var(--bg-card)",
                color: "white",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                transition: "transform 0.2s, background 0.2s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "scale(1.1)";
                e.currentTarget.style.background = "#dc2626";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "scale(1)";
                e.currentTarget.style.background = "var(--accent-red)";
              }}
            >
              <X size={size * 0.12} />
            </button>
          )}
        </div>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleFileSelect}
          style={{ display: "none" }}
        />

        {/* Error message */}
        {error && (
          <p style={{ color: "var(--accent-red)", fontSize: "0.875rem", textAlign: "center" }}>
            {error}
          </p>
        )}

        {/* Help text */}
        <p style={{ color: "var(--text-dim)", fontSize: "0.75rem", textAlign: "center" }}>
          JPG, PNG o WebP. Se comprimirá automáticamente.
        </p>
      </div>

      {/* Cropper Modal */}
      {showCropper && imageToCrop && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.8)",
            zIndex: 10000,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {/* Modal content */}
          <div
            style={{
              background: "var(--bg-card)",
              borderRadius: "12px",
              padding: "1.5rem",
              maxWidth: "90vw",
              maxHeight: "90vh",
              display: "flex",
              flexDirection: "column",
              gap: "1rem",
            }}
          >
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ color: "var(--text-primary)", margin: 0, fontSize: "1.125rem" }}>
                Ajustar imagen
              </h3>
              <button
                onClick={handleCropCancel}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--text-dim)",
                  cursor: "pointer",
                  padding: "0.25rem",
                }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Cropper area */}
            <div
              style={{
                position: "relative",
                width: "min(400px, 80vw)",
                height: "min(400px, 80vw)",
                background: "#000",
                borderRadius: "8px",
                overflow: "hidden",
              }}
            >
              <Cropper
                image={imageToCrop}
                crop={crop}
                zoom={zoom}
                aspect={1}
                cropShape="round"
                showGrid={false}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={onCropComplete}
              />
            </div>

            {/* Zoom control */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.75rem",
                padding: "0 0.5rem",
              }}
            >
              <ZoomOut size={18} style={{ color: "var(--text-dim)" }} />
              <input
                type="range"
                min={1}
                max={3}
                step={0.1}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                style={{
                  flex: 1,
                  accentColor: "var(--accent-blue)",
                  cursor: "pointer",
                }}
              />
              <ZoomIn size={18} style={{ color: "var(--text-dim)" }} />
            </div>

            {/* Actions */}
            <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
              <button
                onClick={handleCropCancel}
                style={{
                  padding: "0.625rem 1.25rem",
                  background: "transparent",
                  border: "1px solid var(--border)",
                  borderRadius: "6px",
                  color: "var(--text-secondary)",
                  fontSize: "0.875rem",
                  fontWeight: "500",
                  cursor: "pointer",
                }}
              >
                Cancelar
              </button>
              <button
                onClick={handleCropConfirm}
                disabled={uploading}
                style={{
                  padding: "0.625rem 1.25rem",
                  background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                  border: "none",
                  borderRadius: "6px",
                  color: "white",
                  fontSize: "0.875rem",
                  fontWeight: "600",
                  cursor: uploading ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  opacity: uploading ? 0.7 : 1,
                }}
              >
                {uploading ? (
                  <>
                    <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
                    Subiendo...
                  </>
                ) : (
                  <>
                    <Check size={16} />
                    Guardar
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Spin animation */}
      <style jsx>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </>
  );
}
