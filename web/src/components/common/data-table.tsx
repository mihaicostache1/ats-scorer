"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SkeletonTableRow } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/common/empty-state";
import { cn } from "@/lib/utils";

export interface Column<T> {
  key: string;
  header: string;
  render?: (row: T) => React.ReactNode;
  sortable?: boolean;
  className?: string;
}

export interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  searchPlaceholder?: string;
  searchFilterKey?: keyof T | ((row: T) => string);
  pageSizeOptions?: number[];
  initialPageSize?: number;
  isLoading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  onRowClick?: (row: T) => void;
  className?: string;
}

type SortDirection = "asc" | "desc" | null;

export function DataTable<T>({
  data,
  columns,
  searchPlaceholder = "Search records...",
  searchFilterKey,
  pageSizeOptions = [5, 10, 20, 50],
  initialPageSize = 5,
  isLoading = false,
  emptyTitle = "No records found",
  emptyDescription = "There are no entries matching your current criteria.",
  onRowClick,
  className,
}: DataTableProps<T>) {
  const [searchQuery, setSearchQuery] = React.useState("");
  const [sortKey, setSortKey] = React.useState<string | null>(null);
  const [sortDirection, setSortDirection] = React.useState<SortDirection>(null);
  const [currentPage, setCurrentPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(initialPageSize);

  // Filter
  const filteredData = React.useMemo(() => {
    if (!searchQuery.trim() || !searchFilterKey) return data;
    const q = searchQuery.toLowerCase().trim();
    return data.filter((item) => {
      if (typeof searchFilterKey === "function") {
        return searchFilterKey(item).toLowerCase().includes(q);
      }
      const val = (item as Record<string, unknown>)[searchFilterKey as string];
      return String(val ?? "")
        .toLowerCase()
        .includes(q);
    });
  }, [data, searchQuery, searchFilterKey]);

  // Sort
  const sortedData = React.useMemo(() => {
    if (!sortKey || !sortDirection) return filteredData;
    return [...filteredData].sort((a, b) => {
      const aVal = (a as Record<string, unknown>)[sortKey];
      const bVal = (b as Record<string, unknown>)[sortKey];
      if (aVal === bVal) return 0;
      if (aVal === undefined || aVal === null) return 1;
      if (bVal === undefined || bVal === null) return -1;
      if (String(aVal) < String(bVal)) return sortDirection === "asc" ? -1 : 1;
      return sortDirection === "asc" ? 1 : -1;
    });
  }, [filteredData, sortKey, sortDirection]);

  // Pagination with clamped active page
  const totalPages = Math.max(1, Math.ceil(sortedData.length / pageSize));
  const activePage = Math.min(Math.max(1, currentPage), totalPages);
  const paginatedData = React.useMemo(() => {
    const start = (activePage - 1) * pageSize;
    return sortedData.slice(start, start + pageSize);
  }, [sortedData, activePage, pageSize]);

  const handleSort = (key: string) => {
    if (sortKey !== key) {
      setSortKey(key);
      setSortDirection("asc");
    } else if (sortDirection === "asc") {
      setSortDirection("desc");
    } else {
      setSortKey(null);
      setSortDirection(null);
    }
  };

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
    }
  };

  return (
    <div className={cn("w-full space-y-4", className)}>
      {/* Search and control bar */}
      {searchFilterKey && (
        <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
          <div className="relative w-full sm:w-72">
            <Search className="text-muted-foreground pointer-events-none absolute top-2.5 left-2.5 size-4" />
            <Input
              type="search"
              placeholder={searchPlaceholder}
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              className="h-9 pl-9"
              aria-label={searchPlaceholder}
            />
          </div>
          <div className="text-muted-foreground self-end text-xs sm:self-center">
            Showing {paginatedData.length} of {filteredData.length} records
          </div>
        </div>
      )}

      {/* Table container */}
      <div className="border-border bg-card overflow-hidden rounded-xl border shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm" role="table">
            <thead className="border-border bg-muted/40 text-muted-foreground border-b font-medium">
              <tr>
                {columns.map((col) => {
                  const isCurrentSort = sortKey === col.key;
                  return (
                    <th
                      key={col.key}
                      scope="col"
                      className={cn(
                        "h-10 px-4 text-xs font-semibold tracking-wider uppercase",
                        col.sortable && "select-none",
                        col.className
                      )}
                      aria-sort={
                        isCurrentSort
                          ? sortDirection === "asc"
                            ? "ascending"
                            : "descending"
                          : undefined
                      }
                    >
                      {col.sortable ? (
                        <button
                          type="button"
                          onClick={() => handleSort(col.key)}
                          className="hover:text-foreground focus-visible:ring-ring flex items-center gap-1.5 rounded py-1 focus-visible:ring-1 focus-visible:outline-none"
                        >
                          {col.header}
                          {isCurrentSort ? (
                            sortDirection === "asc" ? (
                              <ArrowUp className="text-foreground size-3.5" />
                            ) : (
                              <ArrowDown className="text-foreground size-3.5" />
                            )
                          ) : (
                            <ArrowUpDown className="size-3.5 opacity-40 hover:opacity-100" />
                          )}
                        </button>
                      ) : (
                        col.header
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {isLoading ? (
                Array.from({ length: pageSize }).map((_, i) => (
                  <SkeletonTableRow key={i} columns={columns.length} />
                ))
              ) : paginatedData.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="p-8">
                    <EmptyState title={emptyTitle} description={emptyDescription} />
                  </td>
                </tr>
              ) : (
                paginatedData.map((row, idx) => {
                  const record = row as Record<string, unknown>;
                  return (
                    <tr
                      key={String(record.id ?? idx)}
                      onClick={() => onRowClick?.(row)}
                      className={cn(
                        "hover:bg-muted/30 focus-within:bg-muted/30 transition-colors",
                        onRowClick && "cursor-pointer"
                      )}
                    >
                      {columns.map((col) => (
                        <td key={col.key} className={cn("px-4 py-3 align-middle", col.className)}>
                          {col.render ? col.render(row) : (record[col.key] as React.ReactNode)}
                        </td>
                      ))}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination controls */}
        {!isLoading && filteredData.length > 0 && (
          <div className="border-border bg-muted/10 flex flex-col items-center justify-between gap-3 border-t px-4 py-3 sm:flex-row">
            <div className="text-muted-foreground flex items-center gap-2 text-xs">
              <span>Rows per page:</span>
              <div className="w-18">
                <Select
                  value={pageSize.toString()}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="h-7 py-0 text-xs"
                  aria-label="Select page size"
                >
                  {pageSizeOptions.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-muted-foreground text-xs">
                Page {activePage} of {totalPages}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon-xs"
                  onClick={() => handlePageChange(activePage - 1)}
                  disabled={activePage <= 1}
                  aria-label="Previous page"
                >
                  <ChevronLeft className="size-3.5" />
                </Button>
                <Button
                  variant="outline"
                  size="icon-xs"
                  onClick={() => handlePageChange(activePage + 1)}
                  disabled={activePage >= totalPages}
                  aria-label="Next page"
                >
                  <ChevronRight className="size-3.5" />
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
