import { FormEvent, Suspense, lazy, useState, useMemo, useEffect } from 'react';
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
import { Participant } from './db/database';
import { LanguageProvider } from './contexts/LanguageContext';
import { useLanguage } from './contexts/LanguageContext';
import { ensureSingleActiveGroup, syncGroups } from './utils/groupUtils';
import { AppLockGate } from './components/security/AppLockGate';
import { EntitlementProvider, useEntitlement } from './contexts/EntitlementContext';

type Translator = (key: string, params?: Record<string, string>) => string;

const ToolsPage = lazy(() => import('./components/ToolsPage').then(module => ({ default: module.ToolsPage })));

function localizeAuthError(message: string, t: Translator): string {
  const normalized = message.toLowerCase();

  if (normalized.includes('invalid login credentials')) {
    return t('auth.invalidCredentials');
  }

  if (normalized.includes('email not confirmed')) {
    return t('auth.emailNotConfirmed');
  }

  if (normalized.includes('too many requests')) {
    return t('auth.rateLimited');
  }

  return t('auth.failed');
}


function AppContent() {
  const { t } = useLanguage();
  const {
    entitlement,
    loading: entitlementLoading,
    signInWithPassword,
    signOut,
    requestPasswordReset,
    updatePassword,
    recoveryMode,
    authLinkError,
    clearAuthLinkError
  } = useEntitlement();
  const { participants, deleteParticipant } = useParticipants();
  const { groups } = useGroups();
  const { collapsedSections, toggleSection, expandSection, resetToDefaults, setCollapsedState } = useGroupSections();
  const isReadOnly = entitlement.readOnly;

  const [activeTab, setActiveTab] = useState<'participants' | 'tools'>('participants');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingParticipant, setEditingParticipant] = useState<Participant | undefined>();
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [hasSelection, setHasSelection] = useState(false);
  const [groupRefreshKey] = useState(0);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [forgotMode, setForgotMode] = useState(false);
  const [forgotInfo, setForgotInfo] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [resetPasswordConfirm, setResetPasswordConfirm] = useState('');
  const [resetSubmitting, setResetSubmitting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  
  // Ensure data integrity on app startup
  useEffect(() => {
    const init = async () => {
      try {
        console.log("App initializing...");
        await ensureSingleActiveGroup();
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

  // Store original collapsed state before filtering
  const [preFilterCollapsedState, setPreFilterCollapsedState] = useState<{
    active: boolean;
    planned: boolean;
    completed: boolean;
  } | null>(null);

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

  // Auto-expand sections when filters are active and restore when cleared
  useEffect(() => {
    if (hasActiveFilters) {
      // Save current state before expanding (only once)
      if (!preFilterCollapsedState) {
        setPreFilterCollapsedState({ ...collapsedSections });
      }
      // Expand all sections to show filtered results
      if (collapsedSections.active) expandSection('active');
      if (collapsedSections.planned) expandSection('planned');
      if (collapsedSections.completed) expandSection('completed');
    } else if (preFilterCollapsedState) {
      // Restore previous state when filters are cleared
      setCollapsedState(preFilterCollapsedState);
      setPreFilterCollapsedState(null);
    }
  }, [hasActiveFilters]);

  // Apply filters
  const groupsByCourseStartDate = useMemo(() => {
    return new Map((groups ?? []).map(group => [group.courseStartDate, group]));
  }, [groups]);

  const selectableGroups = useMemo(() => {
    return (groups ?? [])
      .filter(group => group.groupNumber !== null && group.groupNumber !== undefined)
      .map(group => ({ ...group, groupNumber: group.groupNumber! }));
  }, [groups]);

  const filteredParticipants = useMemo(() => {
    if (!participants) return [];
    const currentYear = new Date().getFullYear();

    return participants.filter(p => {
      // Find group for this participant
      const groupInfo = groupsByCourseStartDate.get(p.courseStartDate);
      
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
  }, [participants, groupsByCourseStartDate, searchText, selectedGroup, statusFilters, dateRange]);

  // Compute counters
  const totalParticipants = participants?.length || 0;
  const visibleParticipants = filteredParticipants.length;
  const totalCourses = groups?.length || 0;
  const visibleCourses = useMemo(() => {
    if (!groups || groups.length === 0) return 0;

    const visiblePeriods = new Set<string>();
    const groupMap = new Map(groups.map(g => [g.courseStartDate, g]));

    // Always count groups that are represented by currently filtered participants
    filteredParticipants.forEach(p => {
      const group = groupMap.get(p.courseStartDate);
      if (group) {
        visiblePeriods.add(group.courseStartDate);
      }
    });

    // Without active filters, UI shows active section (even if empty) and up to 2 planned groups
    if (!hasActiveFilters) {
      groups.forEach(g => {
        if (g.status === 'active') {
          visiblePeriods.add(g.courseStartDate);
        }
      });

      const plannedDates = groups
        .filter(g => g.status === 'planned')
        .map(g => g.courseStartDate)
        .sort((a, b) => a.localeCompare(b))
        .slice(0, 2);

      plannedDates.forEach(date => visiblePeriods.add(date));
    }

    return visiblePeriods.size;
  }, [groups, filteredParticipants, hasActiveFilters]);

  const completedCount = useMemo(() => {
    return filteredParticipants.filter(p => {
      const completed = p.completedOverride !== null ? p.completedOverride : p.completedComputed;
      return completed;
    }).length;
  }, [filteredParticipants]);

  const handleAddClick = () => {
    if (isReadOnly) {
      alert(t('entitlement.readOnlyAction'));
      return;
    }
    setEditingParticipant(undefined);
    setIsModalOpen(true);
  };

  const handleEditClick = (participant: Participant) => {
    if (isReadOnly) {
      alert(t('entitlement.readOnlyAction'));
      return;
    }
    setEditingParticipant(participant);
    setIsModalOpen(true);
  };

  const handleDeleteClick = async (id: string) => {
    if (isReadOnly) {
      alert(t('entitlement.readOnlyAction'));
      return;
    }
    await deleteParticipant(id);
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

  const handleFilterChange = (filters: { 
    searchTerm: string; 
    courseStartDate: string | null; 
    category: string | null; 
    status: string 
  }) => {
    setSearchText(filters.searchTerm);
    setSelectedGroup(filters.courseStartDate || '');
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

  const handleSignIn = async (event: FormEvent) => {
    event.preventDefault();
    setAuthError(null);

    if (!authEmail.trim() || !authPassword.trim()) {
      setAuthError(t('auth.required'));
      return;
    }

    setForgotInfo(null);

    setAuthSubmitting(true);
    try {
      await signInWithPassword(authEmail.trim(), authPassword);
      setAuthPassword('');
    } catch (err) {
      if (err instanceof Error) {
        setAuthError(localizeAuthError(err.message, t));
      } else {
        setAuthError(t('auth.failed'));
      }
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (err) {
      alert(err instanceof Error ? err.message : t('auth.signOutFailed'));
    }
  };

  const handleSendReset = async (event: FormEvent) => {
    event.preventDefault();
    setAuthError(null);
    setForgotInfo(null);

    if (!authEmail.trim()) {
      setAuthError(t('auth.emailRequired'));
      return;
    }

    setAuthSubmitting(true);
    try {
      await requestPasswordReset(authEmail.trim());
      setForgotInfo(t('auth.resetSent'));
    } catch (err) {
      if (err instanceof Error) {
        setAuthError(localizeAuthError(err.message, t));
      } else {
        setAuthError(t('auth.failed'));
      }
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleUpdatePassword = async (event: FormEvent) => {
    event.preventDefault();
    setResetError(null);

    if (!resetPassword || !resetPasswordConfirm) {
      setResetError(t('auth.resetPasswordRequired'));
      return;
    }

    if (resetPassword.length < 6) {
      setResetError(t('auth.resetPasswordTooShort'));
      return;
    }

    if (resetPassword !== resetPasswordConfirm) {
      setResetError(t('auth.resetPasswordsMismatch'));
      return;
    }

    setResetSubmitting(true);
    try {
      await updatePassword(resetPassword);
      setResetPassword('');
      setResetPasswordConfirm('');
    } catch (err) {
      if (err instanceof Error) {
        setResetError(localizeAuthError(err.message, t));
      } else {
        setResetError(t('auth.failed'));
      }
    } finally {
      setResetSubmitting(false);
    }
  };

  if (recoveryMode) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="w-full max-w-md bg-white rounded-xl shadow p-6 space-y-4">
          <h1 className="text-2xl font-bold text-slate-900">{t('auth.resetTitle')}</h1>
          <p className="text-sm text-slate-600">{t('auth.resetSubtitle')}</p>

          <form onSubmit={handleUpdatePassword} className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('auth.newPassword')}</label>
              <input
                type="password"
                value={resetPassword}
                onChange={e => setResetPassword(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder={t('auth.passwordPlaceholder')}
                autoComplete="new-password"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('auth.confirmPassword')}</label>
              <input
                type="password"
                value={resetPasswordConfirm}
                onChange={e => setResetPasswordConfirm(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder={t('auth.passwordPlaceholder')}
                autoComplete="new-password"
              />
            </div>

            {resetError && <p className="text-sm text-red-600">{resetError}</p>}

            <button
              type="submit"
              disabled={resetSubmitting}
              className={`w-full py-2.5 rounded-lg font-medium ${
                resetSubmitting
                  ? 'bg-slate-300 text-slate-600 cursor-not-allowed'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              {resetSubmitting ? t('common.loading') : t('auth.updatePassword')}
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (entitlement.configured && !entitlement.authenticated) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="w-full max-w-md bg-white rounded-xl shadow p-6 space-y-4">
          <h1 className="text-2xl font-bold text-slate-900">{t('auth.title')}</h1>
          <p className="text-sm text-slate-600">{t('auth.subtitle')}</p>

          <form onSubmit={forgotMode ? handleSendReset : handleSignIn} className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('auth.email')}</label>
              <input
                type="email"
                value={authEmail}
                onChange={e => setAuthEmail(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder={t('auth.emailPlaceholder')}
                autoComplete="email"
              />
            </div>

            {!forgotMode && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t('auth.password')}</label>
                <input
                  type="password"
                  value={authPassword}
                  onChange={e => setAuthPassword(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder={t('auth.passwordPlaceholder')}
                  autoComplete="current-password"
                />
              </div>
            )}

            {authError && <p className="text-sm text-red-600">{authError}</p>}
            {forgotInfo && <p className="text-sm text-emerald-700">{forgotInfo}</p>}
            {authLinkError && <p className="text-sm text-red-600">{authLinkError}</p>}
            {entitlement.error && <p className="text-sm text-red-600">{entitlement.error}</p>}

            <button
              type="submit"
              disabled={authSubmitting || entitlementLoading}
              className={`w-full py-2.5 rounded-lg font-medium ${
                authSubmitting || entitlementLoading
                  ? 'bg-slate-300 text-slate-600 cursor-not-allowed'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              {authSubmitting
                ? t('common.loading')
                : forgotMode
                  ? t('auth.sendReset')
                  : t('auth.signIn')}
            </button>

            <button
              type="button"
              onClick={() => {
                setForgotMode(prev => !prev);
                setAuthError(null);
                setForgotInfo(null);
                clearAuthLinkError();
              }}
              className="w-full py-2 text-sm text-blue-700 hover:text-blue-800"
            >
              {forgotMode ? t('auth.backToLogin') : t('auth.forgotPassword')}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <AppLockGate>
      {/* Top Bar */}
      <TopBar activeTab={activeTab} onTabChange={setActiveTab} />

      {entitlement.configured && entitlement.authenticated && (entitlement.status === 'grace' || isReadOnly) && (
        <div className={`border-b ${isReadOnly ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}>
          <div className="container mx-auto px-4 py-2 text-sm">
            <div>
              <p className={`font-medium ${isReadOnly ? 'text-red-700' : 'text-amber-800'}`}>
                {isReadOnly
                  ? t('entitlement.readOnlyBannerTitle')
                  : t('entitlement.graceBannerTitle')}
              </p>
              {!isReadOnly && entitlement.daysUntilReadOnly !== null && (
                <p className="text-amber-700">
                  {t('entitlement.graceBannerMessage', { days: String(entitlement.daysUntilReadOnly) })}
                </p>
              )}
              {isReadOnly && <p className="text-red-700">{t('entitlement.readOnlyBannerMessage')}</p>}
              {entitlementLoading && <p className="text-slate-500">{t('common.loading')}</p>}
            </div>
          </div>
        </div>
      )}

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
            groups={selectableGroups}
          />

          {/* Action Buttons - Desktop only */}
          <div className="hidden md:flex flex-wrap gap-3 mb-6">
            <button
              onClick={handleAddClick}
              disabled={isReadOnly}
              className={`px-6 py-3 rounded-lg shadow font-medium ${
                isReadOnly ? 'bg-slate-300 text-slate-600 cursor-not-allowed' : 'bg-green-600 text-white hover:bg-green-700'
              }`}
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
                  onDelete={handleDeleteClick}
                  collapsedSections={collapsedSections}
                  toggleSection={toggleSection}
                  expandSection={expandSection}
                  hasActiveFilters={hasActiveFilters}
                  onFilterChange={handleFilterChange}
                  groupRefreshKey={groupRefreshKey}
                />
              </div>
            </div>

            {/* Mobile: Card View */}
            <div className="md:hidden">
              <ParticipantCardList
                participants={filteredParticipants}
                onEdit={handleEditClick}
                onDelete={handleDeleteClick}
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
          <Suspense fallback={<div className="text-sm text-slate-500">{t('common.loading')}</div>}>
            <ToolsPage 
              filteredParticipants={filteredParticipants} 
              entitlement={entitlement}
              entitlementLoading={entitlementLoading}
              onSignOut={handleSignOut}
            />
          </Suspense>
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
        groups={selectableGroups}
        onResetToDefaults={resetToDefaults}
        visibleCount={visibleParticipants}
        totalCount={totalParticipants}
      />

      {/* Participant Modal */}
      <ParticipantModal
        isOpen={isModalOpen}
        onClose={handleModalClose}
        participant={editingParticipant}
      />

      {/* Mobile FAB */}
      {activeTab === 'participants' && !hasSelection && !isReadOnly && (
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
    <EntitlementProvider>
      <LanguageProvider>
        <AppContent />
      </LanguageProvider>
    </EntitlementProvider>
  );
}

export default App;
