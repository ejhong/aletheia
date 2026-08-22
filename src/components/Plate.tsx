import { assetPath } from "@/src/config/assets";
import { romanNumeral, type ImageRecord } from "@/src/domain/schema";

/**
 * A numbered museum plate: a real photograph with provenance, unified into
 * the site's palette by a CSS duotone treatment (the original file is not
 * edited). Only real imagery may be rendered as a plate — enforced by the
 * schema and loader.
 */
export function Plate({ image }: { image: ImageRecord }) {
  if (image.role !== "plate" || !image.provenance) {
    throw new Error(`Plate component requires a plate record (${image.id})`);
  }
  return (
    <figure className="my-2">
      <div className="border border-line bg-paper-deep/60 p-2.5 sm:p-3">
        <div className="plate-frame">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={assetPath(image.file)}
            alt={image.alt}
            loading="lazy"
            className="plate-img w-full"
          />
        </div>
      </div>
      <figcaption className="plate-caption mt-2 px-1">
        <p className="plate-caption-label">
          plate {romanNumeral(image.plateNumber ?? 0)}
          <span className="text-faint normal-case tracking-normal">
            {"  ·  "}photograph — duotone applied in display; original
            unmodified
          </span>
        </p>
        <p className="plate-caption-text mt-1">{image.depicts}</p>
        <p className="plate-caption-credit mt-1">
          {image.provenance.photographer}
          {image.provenance.date ? ` · ${image.provenance.date}` : ""} ·{" "}
          <a
            href={image.provenance.sourceUrl}
            className="underline underline-offset-2 hover:text-copper"
          >
            source
          </a>{" "}
          ·{" "}
          {image.licenseUrl ? (
            <a
              href={image.licenseUrl}
              className="underline underline-offset-2 hover:text-copper"
            >
              {image.license}
            </a>
          ) : (
            image.license
          )}
        </p>
      </figcaption>
    </figure>
  );
}
