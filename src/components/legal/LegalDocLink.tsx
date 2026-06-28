import type { AnchorHTMLAttributes, ReactNode } from "react";

interface LegalDocLinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> {
  href: string;
  children: ReactNode;
  external?: boolean;
}

export default function LegalDocLink({
  href,
  children,
  external,
  className = "",
  ...rest
}: LegalDocLinkProps) {
  return (
    <a
      href={href}
      className={`legal-doc-link touch-manipulation ${className}`.trim()}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      {...rest}
    >
      {children}
    </a>
  );
}
