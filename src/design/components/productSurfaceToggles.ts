export interface ProductSurfaceToggleState {
  surface: string;
  active: boolean;
  disabled: boolean;
  unavailable: boolean;
}

interface BuildProductSurfaceToggleStatesOptions {
  surfaces: readonly string[];
  selected: readonly string[];
  enabledSurfaces?: readonly string[] | null;
  requiredSurfaces?: readonly string[] | null;
  disabled?: boolean;
}

export function buildProductSurfaceToggleStates({
  surfaces,
  selected,
  enabledSurfaces,
  requiredSurfaces,
  disabled = false,
}: BuildProductSurfaceToggleStatesOptions): ProductSurfaceToggleState[] {
  const enabledSet = new Set(enabledSurfaces ?? surfaces);
  const requiredSet = new Set(requiredSurfaces ?? []);

  return surfaces.map((surface) => {
    const active = selected.includes(surface);
    const preventRemoval = active && (
      selected.length === 1 || requiredSet.has(surface)
    );
    const preventAddition = !active && !enabledSet.has(surface);
    return {
      surface,
      active,
      unavailable: !enabledSet.has(surface),
      disabled: disabled || preventRemoval || preventAddition,
    };
  });
}
