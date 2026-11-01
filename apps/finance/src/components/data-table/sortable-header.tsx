"use client";

import type { Column } from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";

export function SortableHeader<TData>({ column, title }: { column: Column<TData, unknown>; title: string }) {
  const sorted = column.getIsSorted();
  const Icon = sorted === "asc" ? ArrowUp : sorted === "desc" ? ArrowDown : ArrowUpDown;
  return (
    <Button variant="ghost" size="sm" className="-ml-2 h-8" onClick={() => column.toggleSorting(sorted === "asc")}>
      {title}
      <Icon className="size-3.5" />
    </Button>
  );
}
