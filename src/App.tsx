import { useState, useMemo, useEffect } from 'react';
import { useParticipants } from './hooks/useParticipants';
import { useGroups } from './hooks/useGroups';
import { useGroupSections } from './hooks/useGroupSections';
import { ParticipantList } from './components/ParticipantList';
import { ParticipantCardList } from './components/ParticipantCardList';
import { ParticipantModal } from './components/ParticipantModal';
import { FiltersDrawer } from './components/FiltersDrawer';
import { FilterChips } from './components/FilterChips';
import { TopBar } from './components/TopBar';
import { StatsPills } from './components/StatsPills';
import { BottomNav } from './components/BottomNav';
import { FAB } from './components/FAB';
import { ToolsPage } from './components/ToolsPage';
import { Participant } from './db/database';
import { LanguageProvider } from './contexts/LanguageContext';
import { useLanguage } from './contexts/LanguageContext';
import { ensureSingleActiveGroup } from './utils/groupUtils';
import { AppLockGate } from './components/security/AppLockGate';


function AppContent() {
  const { t } = useLanguage();
  const { participants, deleteParticipant } = useParticipants();
  const { groups } = useGroups();
  const { collapsedSections, toggleSection, expandSection, resetToDefaults } = useGroupSections();

  const [activeTab, setActiveTab] = useState<'participants' | 'tools'>('participants');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingParticipant, setEditingParticipant] = useState<Participant | undefined>();
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [hasSelection, setHasSelection] = useState(false);
  const [groupRefreshKey, setGroupRefreshKey] = useState(0);
  
  // Ensure data integrity on app startup
  useEffect(() => {
    const init = async () => {
      try {
        console.log("App initializing...");
        await ensureSingleActiveGroup();
        // Sync groups to fix any missing numbers and ensure future periods exist
        const { syncGroups } = await import('./utils/groupUtils');
        await syncGroups();
        console.log("App initialization complete.");
      } catch (err) {
         console.error('CRITICAL: Failed to initialize groups:', err);
         // We might want to trigger error boundary here if essential
      }
    };
    // Small delay to allow Dexie to settle if concurrent opens happen
    setTimeout(init, 100);
  }, []);

  // Filter states
  const [searchText, setSearchText] = useState('');
  const [selectedGroup, setSelectedGroup] = useState('');
  const [statusFilters, setStatusFilters] = useState<{
    sent: boolean | null;
    documents: boolean | null;
    handedOver: boolean | null;
    paid: boolean | null;
    completed: boolean | null;
  }>({
    sent: null,
    documents: null,
    handedOver: null,
    paid: null,
    completed: null
  });
  const [dateRange, setDateRange] = useState({ start: '', end: '' });

  // Check if any filters are active
  const hasActiveFilters = useMemo(() => {
    return searchText !== '' ||
           selectedGroup !== '' ||
           statusFilters.sent !== null ||
           statusFilters.documents !== null ||
           statusFilters.handedOver !== null ||
           statusFilters.paid !== null ||
           statusFilters.completed !== null ||
           dateRange.start !== '' ||
           dateRange.end !== '';
  }, [searchText, selectedGroup, statusFilters, dateRange]);

  // Apply filters
  const filteredParticipants = useMemo(() => {
    if (!participants) return [];
    const currentYear = new Date().getFullYear();

    return participants.filter(p => {
      // Find group for this participant
      const groupInfo = groups?.find(g => g.courseStartDate === p.courseStartDate);
      
      // Archive filter: only show completed participants from current year
      const completed = p.completedOverride !== null ? p.completedOverride : p.completedComputed;
      
      if (completed && groupInfo?.status === 'completed') {
        const courseYear = new Date(p.courseStartDate).getFullYear();
        if (courseYear !== currentYear) {
          return false; // Hide completed participants from previous years
        }
      }

      // Search text filter
      if (searchText) {
        const search = searchText.toLowerCase();
        const matchesSearch = 
          p.companyName.toLowerCase().includes(search) ||
          p.personName.toLowerCase().includes(search) ||
          p.uniqueNumber.toLowerCase().includes(search);
        if (!matchesSearch) return false;
      }

      // Group filter
      if (selectedGroup) {
        // If participant matches group with parsing checks
        const selectedGroupNum = parseInt(selectedGroup, 10);
        
        // If groupInfo exists, compare numbers
        if (groupInfo && groupInfo.groupNumber !== selectedGroupNum) {
            return false;
        }
        // If groupInfo is missing (rare), assume no match if we are filtering by specific group
        if (!groupInfo) return false;
      }

      // Date range filter (show participants whose course starts in the period)
      // Start date is inclusive, end date is exclusive (don't include courses starting ON end date)
      if (dateRange.start && p.courseStartDate < dateRange.start) return false;
      if (dateRange.end && p.courseStartDate >= dateRange.end) return false;

      // Status filters
      if (statusFilters.sent !== null && p.sent !== statusFilters.sent) return false;
      if (statusFilters.documents !== null && p.documents !== statusFilters.documents) return false;
      if (statusFilters.handedOver !== null && p.handedOver !== statusFilters.handedOver) return false;
      if (statusFilters.paid !== null && p.paid !== statusFilters.paid) return false;
      
      if (statusFilters.completed !== null) {
        const completed = p.completedOverride !== null ? p.completedOverride : p.completedComputed;
        if (completed !== statusFilters.completed) return false;
      }

      return true;
    });
  }, [participants, groups, searchText, selectedGroup, statusFilters, dateRange]);

  // Compute counters
  const totalParticipants = participants?.length || 0;
  const visibleParticipants = filteredParticipants.length;
  const totalCourses = groups?.length || 0;
  const visibleCourses = useMemo(() => {
    const uniquePeriods = new Set(filteredParticipants.map(p => p.courseStartDate));
    return uniquePeriods.size;
  }, [filteredParticipants]);

  const completedCount = useMemo(() => {
    return filteredParticipants.filter(p => {
      const completed = p.completedOverride !== null ? p.completedOverride : p.completedComputed;
      return completed;
    }).length;
  }, [filteredParticipants]);

  const handleAddClick = () => {
    setEditingParticipant(undefined);
    setIsModalOpen(true);
  };

  const handleEditClick = (participant: Participant) => {
    setEditingParticipant(participant);
    setIsModalOpen(true);
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    setEditingParticipant(undefined);
  };

  const handleStatusFilterChange = (
    filter: keyof typeof statusFilters,
    value: boolean | null
  ) => {
    setStatusFilters(prev => ({ ...prev, [filter]: value }));
  };

  const handleClearFilters = () => {
    setSearchText('');
    setSelectedGroup('');
    setStatusFilters({
      sent: null,
      documents: null,
      handedOver: null,
      paid: null,
      completed: null
    });
    setDateRange({ start: '', end: '' });
  };

  const handleRemoveFilter = (filterType: string, value?: string) => {
    switch (filterType) {
      case 'search':
        setSearchText('');
        break;
      case 'group':
        setSelectedGroup('');
        break;
      case 'dateStart':
        setDateRange(prev => ({ ...prev, start: '' }));
        break;
      case 'dateEnd':
        setDateRange(prev => ({ ...prev, end: '' }));
        break;
      case 'status':
        if (value) {
          setStatusFilters(prev => ({ ...prev, [value]: null }));
        }
        break;
      case 'all':
        handleClearFilters();
        break;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <AppLockGate>
      {/* Top Bar */}
      <TopBar activeTab={activeTab} onTabChange={setActiveTab} />

        {/* Main Content */}
        {activeTab === 'participants' ? (
          <main className="container mx-auto px-4 py-6 pb-24 md:pb-6">
            {/* Stats Pills */}
            <StatsPills
              totalParticipants={totalParticipants}
              visibleParticipants={visibleParticipants}
              totalCourses={totalCourses}
              visibleCourses={visibleCourses}
              completedCount={completedCount}
            />

          {/* Filter Chips */}
          <FilterChips
            activeFilters={{
              searchText,
              selectedGroup,
              dateRange,
              statusFilters
            }}
            onRemoveFilter={handleRemoveFilter}
            groups={groups?.filter(g => g.groupNumber !== null && g.groupNumber !== undefined).map(g => ({...g, groupNumber: g.groupNumber! })) || []}
          />

          {/* Action Buttons - Desktop only */}
          <div className="hidden md:flex flex-wrap gap-3 mb-6">
            <button
              onClick={handleAddClick}
              className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 shadow font-medium"
            >
              + {t('participants.add')}
            </button>
            <button
              onClick={() => setIsFiltersOpen(true)}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 shadow font-medium"
            >
              {t('filters.title')}
            </button>
          </div>

          {/* Mobile Filter Button */}
          <div className="md:hidden mb-4">
            <button
              onClick={() => setIsFiltersOpen(true)}
              className="w-full px-6 py-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 shadow font-medium min-h-[48px]"
            >
              🔍 {t('filters.title')}
            </button>
          </div>

          {/* Participant Views */}
          <div className="md:bg-white md:rounded-lg md:shadow">
            {/* Desktop: Table View */}
            <div className="hidden md:block">
              <div className="p-4 border-b">
                <h2 className="text-xl font-semibold text-slate-900">
                  {t('participants.title')} {visibleParticipants < totalParticipants && `(${visibleParticipants} ${t('participants.of')} ${totalParticipants})`}
                </h2>
              </div>
              <div className="p-4">
                <ParticipantList
                  participants={filteredParticipants}
                  onEdit={handleEditClick}
                  onDelete={deleteParticipant}
                  collapsedSections={collapsedSections}
                  toggleSection={toggleSection}
                  expandSection={expandSection}
                  hasActiveFilters={hasActiveFilters}
                  groupRefreshKey={groupRefreshKey}
                />
              </div>
            </div>

            {/* Mobile: Card View */}
            <div className="md:hidden">
              <ParticipantCardList
                participants={filteredParticipants}
                onEdit={handleEditClick}
                onDelete={deleteParticipant}
                onSelectionChange={setHasSelection}
                collapsedSections={collapsedSections}
                toggleSection={toggleSection}
                expandSection={expandSection}
                hasActiveFilters={hasActiveFilters}
              />
            </div>
          </div>
        </main>
      ) : (
        <main className="container mx-auto px-4 py-6">
          <ToolsPage 
            filteredParticipants={filteredParticipants} 
            onNavigateHome={() => {
              setGroupRefreshKey(prev => prev + 1);
              setActiveTab('participants');
            }}
          />
        </main>
      )}

      {/* Filters Drawer/Sheet */}
      <FiltersDrawer
        isOpen={isFiltersOpen}
        onClose={() => setIsFiltersOpen(false)}
        searchText={searchText}
        onSearchTextChange={setSearchText}
        selectedGroup={selectedGroup}
        onSelectedGroupChange={setSelectedGroup}
        statusFilters={statusFilters}
        onStatusFilterChange={handleStatusFilterChange}
        dateRange={dateRange}
        onDateRangeChange={setDateRange}
        groups={groups?.filter(g => g.groupNumber !== null && g.groupNumber !== undefined).map(g => ({...g, groupNumber: g.groupNumber! })) || []}
        onResetToDefaults={resetToDefaults}
      />

      {/* Participant Modal */}
      <ParticipantModal
        isOpen={isModalOpen}
        onClose={handleModalClose}
        participant={editingParticipant}
      />

      {/* Mobile FAB */}
      {activeTab === 'participants' && !hasSelection && (
        <FAB onClick={handleAddClick} />
      )}

      {/* Bottom Navigation - Mobile */}
      <BottomNav
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />
      </AppLockGate>
    </div>
  );
}

function App() {
  return (
    <LanguageProvider>
      <AppContent />
    </LanguageProvider>
  );
}

export default App;
