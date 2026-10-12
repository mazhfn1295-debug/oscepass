import { Download, FileText, PlayCircle } from "lucide-react";
import type { CourseAsset } from "@/lib/api";

function readableSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function CourseMediaSection({ assets }: { assets: CourseAsset[] }) {
  const resources = assets.filter((asset) => !asset.mimeType.startsWith("image/"));
  if (!resources.length) return null;

  return <section className="course-media" aria-labelledby="course-media-heading">
    <div className="course-media-heading">
      <span className="eyebrow">Course library</span>
      <h2 id="course-media-heading">Videos and study files</h2>
      <p>Stream teaching videos or open course documents.</p>
    </div>
    <div className="course-media-grid">
      {resources.map((asset) => asset.mimeType.startsWith("video/") ? (
        <article className="course-video-card" key={asset.id}>
          <video controls preload="metadata" playsInline aria-label={`Teaching video: ${asset.filename}`}>
            <source src={asset.url} type={asset.mimeType} />
            Your browser does not support embedded video. Use the link below to open it.
          </video>
          <div className="course-media-caption"><span className="course-media-icon"><PlayCircle size={19} aria-hidden="true" /></span><div><h3>{asset.filename}</h3><p>Video · {readableSize(asset.size)}</p></div><a className="course-media-download" href={asset.url} download={asset.filename} aria-label={`Download ${asset.filename}`}><Download size={18} aria-hidden="true" /></a></div>
        </article>
      ) : (
        <article className="course-file-card" key={asset.id}>
          <span className="course-media-icon"><FileText size={20} aria-hidden="true" /></span>
          <div className="course-file-details"><h3>{asset.filename}</h3><p>PDF · {readableSize(asset.size)}</p></div>
          <a className="btn btn-light" href={asset.url} download={asset.filename}><Download size={15} aria-hidden="true" /> Download</a>
        </article>
      ))}
    </div>
  </section>;
}
