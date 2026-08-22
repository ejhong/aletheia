import { assetPath } from "@/src/config/assets";
import { romanNumeral, type ImageRecord } from "@/src/domain/schema";

/**
 * A numbered museum plate: a real photograph with provenance, unified into
 * the site's palette by a CSS duotone treatment (the original file is not
 * edited). Only real imagery may be rendered as a plate — enforced by the
 * schema and loader.
 *
 * Sized like a printed-journal figure, not a hero image: capped on both
 * axes (landscape binds on width, portrait on height), centered, with the
 * caption block locked to the image width. On narrow screens the width cap
 * exceeds the column, so plates stay near-full-width there.
 */
export function Plate({ image }: { image: ImageRecord }) {
  if (image.role !== "plate" || !image.provenance) {
    throw new Error(`Plate component requires a plate record (${image.id})`);
  }
  return (
    <figure className="my-6 mx-auto w-fit min-w-[min(16rem,100%)] max-w-[26rem]">
      <div className="border border-line bg-paper-deep/60 p-2.5 sm:p-3 w-fit mx-auto">
        <div className="plate-frame">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={assetPath(image.file)}
            alt={image.alt}
            loading="lazy"
            className="plate-img max-h-[24rem] w-auto max-w-full"
          />
        </div>
      </div>
      {/* w-0 + min-w-full locks the caption to the figure's width, so long
          caption lines can't widen the figure past the plate; the figure's
          own 16rem floor keeps captions under narrow portrait plates from
          going skinny and tall. */}
      <figcaption className="mt-2.5 px-1 w-0 min-w-full">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-copper">
          plate {romanNumeral(image.plateNumber ?? 0)}
          <span className="text-faint normal-case tracking-normal">
            {"  ·  "}photograph — duotone applied in display; original
            unmodified
          </span>
        </p>
        <p className="mt-1 text-[12.5px] leading-relaxed text-ink-soft">
          {image.depicts}
        </p>
        <p className="mt-1 font-mono text-[10px] tracking-[0.06em] text-faint">
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
