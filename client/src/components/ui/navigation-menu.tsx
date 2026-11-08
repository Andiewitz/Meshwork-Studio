import * as React from "react";
import * as NavigationMenuPrimitive from "@radix-ui/react-navigation-menu";
import { ArrowRightIcon, ChevronDownIcon } from "@heroicons/react/24/outline";

import { cn } from "@/lib/utils";
import { GridCard } from "@/components/ui/grid-card";

interface NavItemType {
  title: string;
  href: string;
  description?: string;
  icon?: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  onClick?: () => void;
}

function NavigationMenu({
  className,
  children,
  viewport = true,
  ...props
}: React.ComponentProps<typeof NavigationMenuPrimitive.Root> & {
  viewport?: boolean;
}) {
  return (
    <NavigationMenuPrimitive.Root
      data-slot="navigation-menu"
      data-viewport={viewport}
      className={cn(
        "group/navigation-menu relative flex max-w-max flex-1 items-center justify-start",
        className,
      )}
      {...props}
    >
      {children}
      {viewport && <NavigationMenuViewport />}
    </NavigationMenuPrimitive.Root>
  );
}

function NavigationMenuList({
  className,
  ...props
}: React.ComponentProps<typeof NavigationMenuPrimitive.List>) {
  return (
    <NavigationMenuPrimitive.List
      data-slot="navigation-menu-list"
      className={cn(
        "group flex flex-1 list-none items-center justify-start gap-1",
        className,
      )}
      {...props}
    />
  );
}

function NavigationMenuItem({
  className,
  ...props
}: React.ComponentProps<typeof NavigationMenuPrimitive.Item>) {
  return (
    <NavigationMenuPrimitive.Item
      data-slot="navigation-menu-item"
      className={cn("relative", className)}
      {...props}
    />
  );
}

function NavigationMenuTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<typeof NavigationMenuPrimitive.Trigger>) {
  return (
    <NavigationMenuPrimitive.Trigger
      data-slot="navigation-menu-trigger"
      className={cn(
        "group hover:bg-foreground/10 hover:text-foreground focus:bg-foreground/10 focus:text-foreground data-[state=open]:hover:bg-foreground/10 data-[state=open]:text-foreground data-[state=open]:focus:bg-foreground/10 data-[state=open]:bg-foreground/10 inline-flex w-max items-center justify-center rounded-md px-4 py-1.5 text-sm font-medium transition-[color,box-shadow] outline-none text-foreground/70 disabled:pointer-events-none disabled:opacity-50 cursor-pointer",
        className,
      )}
      {...props}
    >
      {children}{" "}
      <ChevronDownIcon
        className="relative top-[1px] ml-1 size-3 transition duration-300 group-data-[state=open]:rotate-180 text-muted-foreground"
        aria-hidden="true"
      />
    </NavigationMenuPrimitive.Trigger>
  );
}

function NavigationMenuContent({
  className,
  ...props
}: React.ComponentProps<typeof NavigationMenuPrimitive.Content>) {
  return (
    <NavigationMenuPrimitive.Content
      data-slot="navigation-menu-content"
      className={cn(
        "data-[motion^=from-]:animate-in data-[motion^=to-]:animate-out data-[motion^=from-]:fade-in data-[motion^=to-]:fade-out data-[motion=from-end]:slide-in-from-right-52 data-[motion=from-start]:slide-in-from-left-52 data-[motion=to-end]:slide-out-to-right-52 data-[motion=to-start]:slide-out-to-left-52 top-0 left-0 w-full md:absolute md:w-auto",
        "group-data-[viewport=false]/navigation-menu:bg-surface/95 group-data-[viewport=false]/navigation-menu:text-foreground group-data-[viewport=false]/navigation-menu:data-[state=open]:animate-in group-data-[viewport=false]/navigation-menu:data-[state=closed]:animate-out group-data-[viewport=false]/navigation-menu:data-[state=closed]:zoom-out-95 group-data-[viewport=false]/navigation-menu:data-[state=open]:zoom-in-95 group-data-[viewport=false]/navigation-menu:data-[state=open]:fade-in-0 group-data-[viewport=false]/navigation-menu:data-[state=closed]:fade-out-0 group-data-[viewport=false]/navigation-menu:top-full group-data-[viewport=false]/navigation-menu:mt-1.5 group-data-[viewport=false]/navigation-menu:overflow-hidden group-data-[viewport=false]/navigation-menu:rounded-xl group-data-[viewport=false]/navigation-menu:border group-data-[viewport=false]/navigation-menu:border-border group-data-[viewport=false]/navigation-menu:shadow-2xl group-data-[viewport=false]/navigation-menu:backdrop-blur-2xl group-data-[viewport=false]/navigation-menu:duration-300 **:data-[slot=navigation-menu-link]:focus:ring-0 **:data-[slot=navigation-menu-link]:focus:outline-none",
        className,
      )}
      {...props}
    />
  );
}

function NavigationMenuViewport({
  className,
  ...props
}: React.ComponentProps<typeof NavigationMenuPrimitive.Viewport>) {
  return (
    <div className="absolute top-full left-0 isolate z-50 flex justify-start">
      <NavigationMenuPrimitive.Viewport
        data-slot="navigation-menu-viewport"
        className={cn(
          "origin-top-left bg-surface/95 text-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-90 relative mt-2 h-[var(--radix-navigation-menu-viewport-height)] w-full overflow-hidden rounded-xl border border-border shadow-2xl backdrop-blur-2xl md:w-[var(--radix-navigation-menu-viewport-width)]",
          className,
        )}
        {...props}
      />
    </div>
  );
}

function NavigationMenuLink({
  className,
  ...props
}: React.ComponentProps<typeof NavigationMenuPrimitive.Link>) {
  return (
    <NavigationMenuPrimitive.Link
      data-slot="navigation-menu-link"
      className={cn(
        "data-[active=true]:focus:bg-foreground/10 data-[active=true]:hover:bg-foreground/10 data-[active=true]:bg-foreground/10 data-[active=true]:text-foreground hover:bg-foreground/10 hover:text-foreground focus:bg-foreground/10 focus:text-foreground [&_svg:not([class*='text-'])]:text-muted-foreground flex flex-col justify-center gap-1 rounded-md px-4 py-1.5 text-sm transition-all outline-none text-foreground/70 [&_svg:not([class*='size-'])]:size-4 cursor-pointer",
        className,
      )}
      {...props}
    />
  );
}

function NavigationMenuIndicator({
  className,
  ...props
}: React.ComponentProps<typeof NavigationMenuPrimitive.Indicator>) {
  return (
    <NavigationMenuPrimitive.Indicator
      data-slot="navigation-menu-indicator"
      className={cn(
        "data-[state=visible]:animate-in data-[state=hidden]:animate-out data-[state=hidden]:fade-out data-[state=visible]:fade-in top-full z-[1] flex h-1.5 items-end justify-center overflow-hidden",
        className,
      )}
      {...props}
    >
      <div className="bg-foreground/10 relative top-[60%] h-2 w-2 rotate-45 rounded-tl-sm shadow-md" />
    </NavigationMenuPrimitive.Indicator>
  );
}

function NavGridCard({
  link,
  className,
  ...props
}: React.ComponentProps<"div"> & {
  link: NavItemType;
}) {
  return (
    <NavigationMenuPrimitive.Link asChild>
      <GridCard
        className={cn(
          "border-border bg-surface hover:border-border transition-colors cursor-pointer",
          className,
        )}
        onClick={link.onClick}
        {...props}
      >
        {link.icon && (
          <link.icon className="text-muted-foreground relative size-5 mb-2" />
        )}
        <div className="relative">
          <span className="text-foreground text-sm font-semibold">
            {link.title}
          </span>
          {link.description && (
            <p className="text-muted-foreground mt-1.5 text-xs leading-relaxed">
              {link.description}
            </p>
          )}
        </div>
      </GridCard>
    </NavigationMenuPrimitive.Link>
  );
}

function NavSmallItem({
  item,
  className,
  ...props
}: React.ComponentProps<typeof NavigationMenuLink> & {
  item: Omit<NavItemType, "description">;
}) {
  return (
    <NavigationMenuLink
      className={cn(
        "group relative h-max flex-row items-center gap-x-3 px-2.5 py-2 hover:bg-foreground/5 rounded-lg text-foreground/80 hover:text-foreground",
        className,
      )}
      onClick={item.onClick}
      {...props}
    >
      {item.icon && <item.icon className="text-muted-foreground size-4" />}
      <p className="text-sm font-medium">{item.title}</p>
      <div className="relative ml-auto flex h-full w-4 items-center">
        <ArrowRightIcon className="size-3.5 -translate-x-2 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100 text-muted-foreground" />
      </div>
    </NavigationMenuLink>
  );
}

function NavLargeItem({
  link,
  className,
  ...props
}: React.ComponentProps<typeof NavigationMenuLink> & {
  link: NavItemType;
}) {
  return (
    <NavigationMenuLink
      className={cn(
        "bg-surface group relative flex flex-col justify-center border border-border hover:border-border rounded-lg transition-colors p-0",
        className,
      )}
      onClick={link.onClick}
      {...props}
    >
      <div className="flex items-center justify-between px-4 py-3">
        <div className="space-y-0.5">
          <span className="text-sm leading-none font-medium text-foreground">
            {link.title}
          </span>
          {link.description && (
            <p className="text-muted-foreground line-clamp-1 text-xs">
              {link.description}
            </p>
          )}
        </div>
        {link.icon && (
          <link.icon className="text-muted-foreground size-5 group-hover:text-foreground/70 transition-colors" />
        )}
      </div>
    </NavigationMenuLink>
  );
}

function NavItemMobile({
  item,
  className,
  ...props
}: React.ComponentProps<"a"> & {
  item: NavItemType;
}) {
  return (
    <a
      className={cn(
        "hover:bg-foreground/10 focus:bg-foreground/10 group relative flex gap-3 rounded-lg p-2.5 text-sm transition-all text-foreground cursor-pointer",
        className,
      )}
      onClick={item.onClick}
      {...props}
    >
      <div
        className={cn(
          "bg-foreground/5 flex size-10 items-center justify-center rounded-lg border border-border shrink-0",
        )}
      >
        {item.icon && <item.icon className="size-5 text-muted-foreground" />}
      </div>
      <div className={cn("flex h-10 flex-col justify-center")}>
        <p className="text-sm font-medium text-foreground">{item.title}</p>
        <span className="text-muted-foreground line-clamp-1 text-xs leading-snug">
          {item.description}
        </span>
      </div>
    </a>
  );
}

export {
  NavigationMenu,
  NavigationMenuList,
  NavigationMenuItem,
  NavigationMenuContent,
  NavigationMenuTrigger,
  NavigationMenuLink,
  NavigationMenuIndicator,
  NavigationMenuViewport,
  NavGridCard,
  NavSmallItem,
  NavLargeItem,
  NavItemMobile,
  type NavItemType,
};
