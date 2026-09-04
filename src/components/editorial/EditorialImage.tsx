import { getImageProps } from "next/image";

type EditorialImageProps = {
  src: string;
  alt?: string;
  className?: string;
  priority?: boolean;
};

/** Static landing photos — plain img avoids next/image hydration flicker. */
export default function EditorialImage({
  src,
  alt = "",
  className = "",
  priority = false,
}: EditorialImageProps) {
  const responsive = src === "/landing/hero.jpg"
    ? getImageProps({ src, alt, width: 1920, height: 1080, sizes: "100vw", priority }).props
    : {};
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      {...responsive}
      alt={alt}
      className={className}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      fetchPriority={priority ? "high" : "auto"}
    />
  );
}
