import { Link as RouterLink } from "react-router-dom";
import { Button, Link } from "@heroui/react";
import type { ButtonProps } from "@heroui/react";

// HeroUI Button rendered as a React Router link, so client-side navigation still works.
export function RouteButton({ to, ...props }: ButtonProps & { to: string }) {
  return <Button {...props} render={(p: any) => <RouterLink {...p} to={to} />} />;
}

// HeroUI Link rendered as a React Router link.
export function RouteLink({ to, children, className = "" }: { to: string; children: React.ReactNode; className?: string }) {
  return (
    <Link className={className} render={(p: any) => <RouterLink {...p} to={to} />}>
      {children}
    </Link>
  );
}
