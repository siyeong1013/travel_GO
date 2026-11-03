/**
 * The credit Google's policies require wherever Places data (suggestions, names, addresses) is
 * shown without a Google map: "Google Maps" untranslated, regular weight, #5E5E5E, 12–16px,
 * in the same container as the data.
 */
export function GoogleMapsAttribution({ className = '' }: { className?: string }) {
  return (
    <p
      translate="no"
      className={`text-xs font-normal whitespace-nowrap text-[#5e5e5e] ${className}`}
    >
      Google Maps
    </p>
  );
}
