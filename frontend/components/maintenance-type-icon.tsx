import {
  ClipboardTextIcon,
  DiscIcon,
  DropIcon,
  TireIcon,
  ToolboxIcon,
  WrenchIcon,
  type Icon,
} from "@phosphor-icons/react";
import type { MaintenanceType } from "@/lib/maintenance-schema";

const TYPE_ICONS: Record<MaintenanceType, Icon> = {
  oil_change: DropIcon,
  tire_rotation: TireIcon,
  brakes: DiscIcon,
  inspection: ClipboardTextIcon,
  repair: WrenchIcon,
  other: ToolboxIcon,
};

export function MaintenanceTypeIcon({ type }: { type: MaintenanceType }) {
  const TypeIcon = TYPE_ICONS[type];

  return <TypeIcon className="size-4" />;
}
