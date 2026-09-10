import type { PropertyResult } from "@/lib/properties-api";
import { PropertyCard } from "./PropertyCard";

interface PropertyListProps {
  properties: PropertyResult[];
  total: number;
  hoveredId: string | null;
  selectedId: string | null;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
}

export function PropertyList({
  properties,
  total,
  hoveredId,
  selectedId,
  onHover,
  onSelect,
}: PropertyListProps) {
  if (properties.length === 0) {
    return (
      <div className="rounded border border-border-subtle bg-surface p-xl text-center text-sm text-text-secondary">
        No properties match the current filters. Try widening your criteria.
      </div>
    );
  }

  return (
    <div>
      <p className="mb-sm text-sm text-text-secondary">
        Showing {properties.length} of {total} {total === 1 ? "property" : "properties"}
      </p>
      <div className="flex flex-col gap-lg">
        {properties.map((property) => (
          <PropertyCard
            key={property.id}
            property={property}
            selected={property.id === selectedId || property.id === hoveredId}
            onHover={onHover}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
}
