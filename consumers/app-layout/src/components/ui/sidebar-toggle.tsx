import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";

export function SidebarToggle() {
  const isMobile = useIsMobile();
  return <Button variant="outline">{isMobile ? "Menu" : "Collapse"}</Button>;
}
