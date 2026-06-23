import { MASTER_SERVICE_DISCLAIMER } from "@/lib/master-disclosure";

interface MasterServiceDisclaimerProps {
  className?: string;
}

export default function MasterServiceDisclaimer({ className = "" }: MasterServiceDisclaimerProps) {
  return (
    <p
      className={`master-showcase-disclaimer text-[11px] leading-relaxed text-gray-500/90 ${className}`.trim()}
      role="note"
    >
      {MASTER_SERVICE_DISCLAIMER}
    </p>
  );
}
