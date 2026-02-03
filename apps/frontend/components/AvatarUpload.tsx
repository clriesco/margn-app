import React, { useState, useRef } from "react";
import { Camera, Loader2, X } from "lucide-react";
import { supabase } from "../lib/supabase";

interface AvatarUploadProps {
  userId: string;
  currentAvatarUrl?: string | null;
  onUploadComplete: (url: string | null) => void;
  size?: number;
}

export default function AvatarUpload({
  userId,
  currentAvatarUrl,
  onUploadComplete,
  size = 96,
}: AvatarUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentAvatarUrl || null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Solo se permiten imágenes JPG, PNG o WebP");
      return;
    }

    // Validate file size (2MB max)
    if (file.size > 2 * 1024 * 1024) {
      setError("La imagen no puede superar 2MB");
      return;
    }

    setError(null);
    setUploading(true);

    try {
      // Create preview
      const objectUrl = URL.createObjectURL(file);
      setPreviewUrl(objectUrl);

      // Upload to Supabase Storage
      const fileExt = file.name.split(".").pop();
      const filePath = `${userId}/avatar.${fileExt}`;

      // Delete existing avatar first (if any)
      await supabase.storage.from("avatars").remove([`${userId}/avatar.jpg`, `${userId}/avatar.png`, `${userId}/avatar.webp`]);

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(filePath, file, {
          cacheControl: "3600",
          upsert: true,
        });

      if (uploadError) {
        throw uploadError;
      }

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from("avatars")
        .getPublicUrl(filePath);

      // Add cache buster to force refresh
      const urlWithCacheBuster = `${publicUrl}?t=${Date.now()}`;

      onUploadComplete(urlWithCacheBuster);
      setPreviewUrl(urlWithCacheBuster);
    } catch (err) {
      console.error("Error uploading avatar:", err);
      setError("Error al subir la imagen. Inténtalo de nuevo.");
      setPreviewUrl(currentAvatarUrl || null);
    } finally {
      setUploading(false);
      // Reset input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleRemoveAvatar = async () => {
    setUploading(true);
    setError(null);

    try {
      // Remove all possible extensions
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
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1rem" }}>
      {/* Avatar preview */}
      <div
        style={{
          position: "relative",
          width: size,
          height: size,
        }}
      >
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
              <Loader2 size={size * 0.3} className="animate-spin" style={{ animation: "spin 1s linear infinite" }} />
            </div>
          )}
        </div>

        {/* Upload button overlay */}
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

        {/* Remove button (only if has avatar) */}
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
        JPG, PNG o WebP. Máximo 2MB.
      </p>

      {/* Spin animation */}
      <style jsx>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
