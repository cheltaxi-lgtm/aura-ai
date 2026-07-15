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
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className={className}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      fetchPriority={priority ? "high" : "auto"}
    />
  );
}
