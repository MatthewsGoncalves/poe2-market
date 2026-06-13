interface Props {
  src?: string;
  alt: string;
  size?: number;
}

export function ItemIcon({ src, alt, size = 32 }: Props) {
  if (!src) {
    return <span className="item-icon item-icon-placeholder" style={{ width: size, height: size }} aria-hidden="true" />;
  }
  return (
    <img
      className="item-icon"
      src={src}
      alt={alt}
      width={size}
      height={size}
      loading="lazy"
    />
  );
}
