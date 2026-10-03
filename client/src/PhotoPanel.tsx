import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api, ApiError } from "./api";

type Photo = {
  id: string;
  name: string;
  url: string;
};

const MAX_PHOTOS = 5;
const MAX_FILE_SIZE = 5 * 1024 * 1024;

const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
];

function errorMessage(error: unknown) {
  return error instanceof ApiError
    ? error.message
    : "Could not reach the API. Please try again.";
}

export default function PhotoPanel({
  submissionId,
  canUpload = false,
}: {
  submissionId: string;
  canUpload?: boolean;
}) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [action, setAction] = useState<"upload" | "refresh" | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const busy = action !== null;
  const remaining = MAX_PHOTOS - photos.length;

  useEffect(() => {
    let active = true;

   

    async function load() {
      try {
        const result = await api<{ photos: Photo[] }>(
          `/submissions/${submissionId}/photos`
        );

        if (active) {
          setPhotos(result.photos);
          setLoaded(true);
        }
      } catch (err) {
        if (active) setError(errorMessage(err));
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, [submissionId]);

  async function refreshPhotos() {
    const result = await api<{ photos: Photo[] }>(
      `/submissions/${submissionId}/photos`
    );

    setPhotos(result.photos);
    setLoaded(true);
  }

  async function uploadPhotos(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (busy || !canUpload || !loaded) return;

    const form = event.currentTarget;
    const data = new FormData(form);

    const files = data.getAll("photos").filter(
      (value): value is File =>
        value instanceof File && value.size > 0
    );

    setError("");
    setMessage("");

    if (files.length === 0) {
      setError("Select at least one photo.");
      return;
    }

    if (files.length > remaining) {
      setError(
        `You can attach ${remaining} more ${
          remaining === 1 ? "photo" : "photos"
        } to this form.`
      );
      return;
    }

    if (files.some((file) => file.size > MAX_FILE_SIZE)) {
      setError("Each photo must be no more than 5 MB.");
      return;
    }

    if (files.some((file) => !ALLOWED_TYPES.includes(file.type))) {
      setError("Choose JPEG, PNG or WebP photos.");
      return;
    }

    setAction("upload");

    try {
      await api(`/submissions/${submissionId}/photos`, {
        method: "POST",
        body: data,
      });
    } catch (err) {
      setError(errorMessage(err));
      setAction(null);
      return;
    }

    form.reset();
    setMessage(
      `${files.length} ${
        files.length === 1 ? "photo saved" : "photos saved"
      }.`
    );

    try {
      await refreshPhotos();
    } catch {
      setLoaded(false);
      setError(
        "Your photos were saved, but the gallery could not refresh. Click Refresh photos."
      );
    } finally {
      setAction(null);
    }
  }

  async function reload() {
    if (busy) return;

    setAction("refresh");
    setError("");
    setMessage("");

    try {
      await refreshPhotos();
    } catch (err) {
      setLoaded(false);
      setError(errorMessage(err));
    } finally {
      setAction(null);
    }
  }

  return (
    <section
      className="photo-panel"
      aria-label="Submission photos"
      aria-busy={loading || busy}
    >
      <h3>Site photos</h3>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {message && (
        <p className="message" role="status">
          {message}
        </p>
      )}

      {loading ? (
        <p role="status">Loading photos...</p>
      ) : (
        <>
          {loaded && photos.length === 0 && (
            <p className="muted">No photos attached.</p>
          )}

          {photos.length > 0 && (
            <div className="photo-grid">
              {photos.map((photo) => (
                <a
                  key={`${photo.id}-${photo.url}`}
                  href={photo.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Open ${photo.name || "site photo"}`}
                >
                  <img
                    src={photo.url}
                    alt={photo.name || "Site photo"}
                    loading="lazy"
                  />
                </a>
              ))}
            </div>
          )}

          <button
            className="secondary"
            type="button"
            onClick={reload}
            disabled={busy}
          >
            {action === "refresh" ? "Refreshing..." : "Refresh photos"}
          </button>

          {canUpload && loaded && remaining > 0 && (
            <form onSubmit={uploadPhotos}>
              <label>
                Attach photos
                <input
                  name="photos"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  required
                  disabled={busy}
                />
              </label>

              <p className="muted">
                JPEG, PNG or WebP. Up to 5 MB each.
                {" "}
                {remaining} photo {remaining === 1 ? "space" : "spaces"} remaining.
              </p>

              <button
                className="primary"
                type="submit"
                disabled={busy}
              >
                {action === "upload" ? "Uploading..." : "Upload photos"}
              </button>
            </form>
          )}

          {loaded && remaining === 0 && (
            <p className="muted">
              This form has reached its five-photo limit.
            </p>
          )}
        </>
      )}
    </section>
  );
}