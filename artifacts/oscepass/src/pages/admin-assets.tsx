import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Trash2, Upload, Video } from "lucide-react";
import { ApiError, request, type Course, type CourseAsset } from "@/lib/api";
import { ErrorBlock, LoadingBlock } from "@/components/data-state";
import { ConfirmDialog, describeError, type Notify } from "@/pages/admin-ui";

type Asset = CourseAsset;

function formatSize(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function putFile(url: string, file: File, onProgress: (value: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", file.type);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error("Storage rejected the upload. Please retry."));
    xhr.onerror = () => reject(new Error("Could not reach file storage. Check your connection and try again."));
    xhr.onabort = () => reject(new Error("Upload was cancelled."));
    xhr.send(file);
  });
}

export function CourseAssetsTab({ courses, notify }: { courses: Course[]; notify: Notify }) {
  const qc = useQueryClient();
  const [courseId, setCourseId] = useState<number | null>(courses[0]?.id ?? null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState<Asset | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const course = courses.find((item) => item.id === courseId);
  const assets = useQuery({
    queryKey: ["admin", "media", courseId],
    queryFn: () => request<Asset[]>(`/admin/courses/${courseId}/media`),
    enabled: courseId !== null,
  });

  useEffect(() => {
    if (courseId === null && courses.length) setCourseId(courses[0].id);
    else if (courseId !== null && !courses.some((item) => item.id === courseId)) setCourseId(courses[0]?.id ?? null);
  }, [courseId, courses]);

  async function upload(file?: File) {
    if (!file || courseId === null) return;
    setError("");
    const allowed = ["video/mp4", "video/webm", "application/pdf"];
    if (!allowed.includes(file.type)) {
      setError("Choose an MP4 or WebM video, or a PDF document.");
      return;
    }
    const limit = file.type.startsWith("video/") ? 512 * 1024 * 1024 : 50 * 1024 * 1024;
    if (file.size > limit) {
      setError(file.type.startsWith("video/") ? "Videos must be 512 MB or smaller." : "PDFs must be 50 MB or smaller.");
      return;
    }
    setUploading(true);
    setProgress(0);
    try {
      const { uploadURL, objectPath } = await request<{ uploadURL: string; objectPath: string }>("/admin/media/upload-url", {
        method: "POST",
        body: { filename: file.name, mimeType: file.type, size: file.size },
      });
      await putFile(uploadURL, file, setProgress);
      await request("/admin/media", {
        method: "POST",
        body: { filename: file.name, mimeType: file.type, size: file.size, objectPath, courseId },
      });
      await qc.invalidateQueries({ queryKey: ["admin", "media", courseId] });
      await qc.invalidateQueries({ queryKey: ["course"] });
      notify({ type: "ok", text: `${file.name} uploaded to ${course?.title ?? "the course"}.` });
    } catch (caught) {
      setError(caught instanceof ApiError ? describeError(caught) : caught instanceof Error ? caught.message : "Upload failed. Please retry.");
    } finally {
      setUploading(false);
      setProgress(0);
    }
  }

  async function removeAsset() {
    if (!deleting || courseId === null) return;
    setDeleteBusy(true);
    try {
      await request(`/admin/media/${deleting.id}`, { method: "DELETE" });
      await qc.invalidateQueries({ queryKey: ["admin", "media", courseId] });
      await qc.invalidateQueries({ queryKey: ["course"] });
      notify({ type: "ok", text: `${deleting.filename} was permanently deleted.` });
      setDeleting(null);
    } catch (caught) {
      notify({ type: "err", text: describeError(caught) });
    } finally {
      setDeleteBusy(false);
    }
  }

  if (!courses.length) return <div className="state-box"><h3>Create a course first</h3><p>Course videos and files belong to a course.</p></div>;

  return <section aria-label="Course videos and files" className="adm-assets">
    <div className="adm-assets-intro">
      <div><h2>Course videos &amp; files</h2><p>Uploads go directly to private file storage. Learners can access them only when their course is published.</p></div>
      <label className="adm-field adm-assets-course"><span className="adm-label">Course</span><select value={courseId ?? ""} onChange={(event) => setCourseId(Number(event.target.value))}>{courses.map((item) => <option key={item.id} value={item.id}>{item.title} · {item.status}</option>)}</select></label>
    </div>
    <div className="adm-assets-upload">
      <div className="adm-assets-drop">
        <span className="adm-assets-upload-icon"><Upload size={20} aria-hidden="true" /></span>
        <div><strong>Add a teaching video or study file</strong><p>MP4 / WebM up to 512 MB · PDF up to 50 MB</p></div>
        <label className={`btn btn-primary adm-upload${uploading ? " is-disabled" : ""}`}>{uploading ? `Uploading ${progress}%` : "Choose file"}
          <input type="file" accept="video/mp4,video/webm,application/pdf" className="sr-only" disabled={uploading || !courseId} onChange={(event) => { void upload(event.target.files?.[0]); event.target.value = ""; }} />
        </label>
      </div>
      {uploading && <div className="adm-upload-progress" role="progressbar" aria-label="Uploading file" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><span style={{ width: `${progress}%` }} /></div>}
      {error && <p className="adm-error" role="alert">{error}</p>}
      {course?.status === "draft" && <p className="adm-assets-note">This course is a draft. Its files will remain unavailable to learners until you publish the course.</p>}
    </div>

    {assets.isPending && <LoadingBlock label="Loading course files" />}
    {assets.isError && <ErrorBlock error={assets.error} onRetry={() => assets.refetch()} />}
    {assets.data && (assets.data.length === 0
      ? <div className="state-box"><h3>No files yet</h3><p>Upload your first video or PDF for this course.</p></div>
      : <div className="adm-assets-list">{assets.data.map((asset) => {
        const isVideo = asset.mimeType.startsWith("video/");
        const Icon = isVideo ? Video : FileText;
        return <article className="adm-asset-row" key={asset.id}>
          <span className={`adm-asset-icon${isVideo ? " is-video" : ""}`}><Icon size={20} aria-hidden="true" /></span>
          <div className="adm-asset-info"><strong>{asset.filename}</strong><span>{isVideo ? "Video" : "PDF"} · {formatSize(asset.size)} · Added {new Date(asset.createdAt).toLocaleDateString()}</span></div>
          <a href={asset.url} className="btn btn-light adm-asset-preview" target="_blank" rel="noreferrer">Preview</a>
          <button type="button" className="adm-icon adm-danger" onClick={() => setDeleting(asset)} aria-label={`Delete ${asset.filename}`}><Trash2 size={17} aria-hidden="true" /></button>
        </article>;
      })}</div>)}
    {deleting && <ConfirmDialog title="Delete this course file?" message={`“${deleting.filename}” will be permanently removed from storage and from the course page. This cannot be undone.`} confirmLabel="Delete file" busy={deleteBusy} onCancel={() => setDeleting(null)} onConfirm={() => void removeAsset()} />}
  </section>;
}
