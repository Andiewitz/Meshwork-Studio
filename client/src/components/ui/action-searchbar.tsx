import React, { useEffect, useMemo, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  Box,
  FolderKanban,
  LayoutDashboard,
  Layers,
  Search,
  Settings,
  Users,
  X,
} from "lucide-react";
import { useLocation } from "wouter";
import { useWorkspaces } from "@/hooks/use-workspaces";
import type { Node } from "@xyflow/react";
import type { NodeData } from "@/types/canvas";
import "./action-searchbar.css";

export interface Action {
  id: string;
  label: string;
  icon: React.ReactNode;
  description?: string;
  category?: string;
  keywords?: string[];
  onSelect: () => void;
}

export function filterSearchActions(
  actions: Action[],
  query: string,
): Action[] {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return actions.filter((action) => {
    const text = [
      action.label,
      action.description,
      action.category,
      ...(action.keywords || []),
    ]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase();
    return terms.every((term) => text.includes(term));
  });
}

export function getDefaultMeshworkActions(
  navigate: (path: string) => void,
): Action[] {
  return [
    {
      id: "nav:home",
      label: "Dashboard",
      icon: <LayoutDashboard />,
      description: "Overview and recent projects",
      category: "Navigation",
      onSelect: () => navigate("/home"),
    },
    {
      id: "nav:workspaces",
      label: "All projects",
      icon: <FolderKanban />,
      description: "Browse your projects",
      category: "Navigation",
      onSelect: () => navigate("/workspaces"),
    },
    {
      id: "nav:templates",
      label: "Templates Library",
      icon: <Layers />,
      description: "Explore architecture templates",
      category: "Navigation",
      onSelect: () => navigate("/templates"),
    },
    {
      id: "nav:connectors",
      label: "Connectors",
      icon: <Users />,
      description: "Explore service connectors",
      category: "Navigation",
      onSelect: () => navigate("/connectors"),
    },
    {
      id: "nav:settings",
      label: "Settings",
      icon: <Settings />,
      description: "Account and preferences",
      category: "Navigation",
      onSelect: () => navigate("/settings"),
    },
  ];
}

interface ActionSearchBarProps {
  isOpen?: boolean;
  onClose?: () => void;
  isModal?: boolean;
  nodes?: Node<NodeData>[];
  onSelectNode?: (nodeId: string) => void;
}

export function ActionSearchBar({
  isOpen = true,
  onClose,
  isModal = false,
  nodes,
  onSelectNode,
}: ActionSearchBarProps) {
  const [, navigate] = useLocation();
  const { data: workspaces, isLoading, isError } = useWorkspaces();
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const actions = useMemo<Action[]>(
    () => [
      ...(nodes && onSelectNode
        ? nodes
            .filter((node) => node.type !== "junction")
            .map((node) => ({
              id: `node:${node.id}`,
              label: node.data.label?.trim() || node.type || "Node",
              icon: <Box />,
              description: [
                node.type,
                node.data.provider,
                node.data.description,
                ...(node.data.tags || []),
              ]
                .filter(Boolean)
                .join(" · "),
              category: "Canvas node",
              onSelect: () => onSelectNode(node.id),
            }))
        : []),
      ...(workspaces || []).map((workspace) => ({
        id: `workspace:${workspace.id}`,
        label: workspace.title,
        icon: <FolderKanban />,
        description: workspace.description || workspace.type || "Project",
        keywords: [
          workspace.type,
          ...(workspace.tags || []),
          ...(workspace.groups || []),
        ],
        category: "Project",
        onSelect: () => navigate(`/workspace/${workspace.id}`),
      })),
      ...getDefaultMeshworkActions(navigate),
    ],
    [nodes, onSelectNode, workspaces, navigate],
  );
  const results = useMemo(
    () => filterSearchActions(actions, query),
    [actions, query],
  );
  const activeIndex = Math.min(selectedIndex, Math.max(results.length - 1, 0));

  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedIndex(0);
    }
  }, [isOpen]);
  useEffect(() => {
    const active = listRef.current?.querySelector<HTMLElement>(
      `[data-index="${activeIndex}"]`,
    );
    active?.scrollIntoView?.({ block: "nearest" });
  }, [activeIndex]);
  const selectAction = (action: Action) => {
    onClose?.();
    action.onSelect();
  };
  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      setSelectedIndex((previous) =>
        results.length
          ? (Math.min(previous, results.length - 1) +
              direction +
              results.length) %
            results.length
          : 0,
      );
    } else if (event.key === "Enter" && results[activeIndex]) {
      event.preventDefault();
      selectAction(results[activeIndex]);
    } else if (event.key === "Escape" && !isModal) {
      onClose?.();
    }
  };
  const content = (
    <div className="mesh-search">
      <div className="mesh-search-input-row">
        <Search aria-hidden="true" />
        <input
          ref={inputRef}
          role="combobox"
          aria-label="Search projects, canvas nodes, and pages"
          aria-expanded="true"
          aria-controls="mesh-search-results"
          aria-activedescendant={
            results[activeIndex]
              ? `mesh-search-result-${activeIndex}`
              : undefined
          }
          autoComplete="off"
          placeholder="Search projects, canvas nodes, and pages"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setSelectedIndex(0);
          }}
          onKeyDown={handleKeyDown}
        />
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setSelectedIndex(0);
              inputRef.current?.focus();
            }}
            aria-label="Clear search"
          >
            <X aria-hidden="true" />
          </button>
        )}
        {isModal && (
          <button type="button" onClick={onClose} aria-label="Close search">
            <span aria-hidden="true">Esc</span>
          </button>
        )}
      </div>
      {isLoading && (
        <p className="mesh-search-status" role="status">
          Loading projects…
        </p>
      )}
      {isError && (
        <p className="mesh-search-status" role="status">
          Could not load projects. Navigation and canvas results are still
          available.
        </p>
      )}
      {results.length ? (
        <ul
          ref={listRef}
          id="mesh-search-results"
          role="listbox"
          aria-label="Search results"
          className="mesh-search-results"
        >
          {results.map((action, index) => (
            <li
              key={action.id}
              role="option"
              id={`mesh-search-result-${index}`}
              aria-selected={index === activeIndex}
              data-index={index}
              onMouseEnter={() => setSelectedIndex(index)}
            >
              <button
                type="button"
                tabIndex={-1}
                onClick={() => selectAction(action)}
                className="mesh-search-result"
              >
                <span className="mesh-search-icon">{action.icon}</span>
                <span className="mesh-search-copy">
                  <span className="mesh-search-label">{action.label}</span>
                  {action.description && (
                    <span className="mesh-search-description">
                      {action.description}
                    </span>
                  )}
                </span>
                <span className="mesh-search-category">{action.category}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mesh-search-status" role="status">
          No results for “{query}”.
        </p>
      )}
      <div className="mesh-search-footer">
        Use ↑ ↓ to navigate · Enter to open
      </div>
    </div>
  );
  if (!isModal) return content;
  return (
    <Dialog.Root
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose?.();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="mesh-search-overlay" />
        <Dialog.Content
          className="mesh-search-dialog"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            inputRef.current?.focus();
          }}
        >
          <Dialog.Title className="sr-only">Search Meshwork</Dialog.Title>
          <Dialog.Description className="sr-only">
            Search your projects, the current canvas, and navigation pages.
          </Dialog.Description>
          {content}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export default ActionSearchBar;
