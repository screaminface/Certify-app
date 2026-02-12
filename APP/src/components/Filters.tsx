import React from 'react';

interface FilterProps {
  searchText: string;
  onSearchTextChange: (value: string) => void;
  selectedGroup: string;
  onSelectedGroupChange: (value: string) => void;
  statusFilters: {
    sent: boolean | null;
    documents: boolean | null;
    handedOver: boolean | null;
    paid: boolean | null;
    completed: boolean | null;
  };
  onStatusFilterChange: (filter: keyof FilterProps['statusFilters'], value: boolean | null) => void;
  dateRange: {
    start: string;
    end: string;
  };
  onDateRangeChange: (range: { start: string; end: string }) => void;
  groups: Array<{ groupNumber: number; courseStartDate: string }>;
  onClearFilters: () => void;
}

export const Filters: React.FC<FilterProps> = ({
  searchText,
  onSearchTextChange,
  selectedGroup,
  onSelectedGroupChange,
  statusFilters,
  onStatusFilterChange,
  dateRange,
  onDateRangeChange,
  groups,
  onClearFilters
}) => {
  const hasActiveFilters = 
    searchText || 
    selectedGroup || 
    dateRange.start || 
    dateRange.end ||
    Object.values(statusFilters).some(v => v !== null);

  const StatusFilterButton: React.FC<{
    label: string;
    value: boolean | null;
    onChange: (value: boolean | null) => void;
  }> = ({ label, value, onChange }) => (
    <div className="flex items-center gap-2">
      <span className="text-sm text-gray-700">{label}:</span>
      <div className="flex gap-1">
        <button
          onClick={() => onChange(null)}
          className={`px-2 py-1 text-xs rounded ${
            value === null ? 'bg-gray-400 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          All
        </button>
        <button
          onClick={() => onChange(true)}
          className={`px-2 py-1 text-xs rounded ${
            value === true ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          Yes
        </button>
        <button
          onClick={() => onChange(false)}
          className={`px-2 py-1 text-xs rounded ${
            value === false ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          No
        </button>
      </div>
    </div>
  );

  return (
    <div className="bg-white p-4 rounded-lg shadow mb-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Filters</h3>
        {hasActiveFilters && (
          <button
            onClick={onClearFilters}
            className="text-sm text-blue-600 hover:text-blue-800"
          >
            Clear All Filters
          </button>
        )}
      </div>

      <div className="space-y-4">
        {/* Search Text */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Search (Company, Person, or Unique #)
          </label>
          <input
            type="text"
            value={searchText}
            onChange={(e) => onSearchTextChange(e.target.value)}
            placeholder="Search..."
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Group Filter */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Filter by Group
          </label>
          <select
            value={selectedGroup}
            onChange={(e) => onSelectedGroupChange(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Groups</option>
            {groups.map((group) => (
              <option key={group.groupNumber} value={group.groupNumber.toString()}>
                Group {group.groupNumber} - {group.courseStartDate}
              </option>
            ))}
          </select>
        </div>

        {/* Date Range */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Course Start Date Range
          </label>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="date"
              value={dateRange.start}
              onChange={(e) => onDateRangeChange({ ...dateRange, start: e.target.value })}
              placeholder="From"
              className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="date"
              value={dateRange.end}
              onChange={(e) => onDateRangeChange({ ...dateRange, end: e.target.value })}
              placeholder="To"
              className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Status Filters */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Status Filters
          </label>
          <div className="space-y-2">
            <StatusFilterButton
              label="Sent"
              value={statusFilters.sent}
              onChange={(v) => onStatusFilterChange('sent', v)}
            />
            <StatusFilterButton
              label="Documents"
              value={statusFilters.documents}
              onChange={(v) => onStatusFilterChange('documents', v)}
            />
            <StatusFilterButton
              label="Handed Over"
              value={statusFilters.handedOver}
              onChange={(v) => onStatusFilterChange('handedOver', v)}
            />
            <StatusFilterButton
              label="Paid"
              value={statusFilters.paid}
              onChange={(v) => onStatusFilterChange('paid', v)}
            />
            <StatusFilterButton
              label="Completed"
              value={statusFilters.completed}
              onChange={(v) => onStatusFilterChange('completed', v)}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
