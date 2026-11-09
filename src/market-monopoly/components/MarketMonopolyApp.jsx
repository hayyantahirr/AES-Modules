import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  TactileButton,
  EasyLoadingScreen,
} from "../../components/ui/EasyComponents.jsx";
import {
  IconWallet,
  IconBriefcase,
  IconLayers,
  IconCalendar,
  IconSun,
  IconMoon,
  IconSearch,
  IconClose,
  IconRadar,
  IconTrendingUp,
} from "../../components/ui/CustomIcons.jsx";
import {
  KARACHI_UTILITIES,
  computePropertyValuation,
  computePropertyRent,
} from "../data/monopolyData.js";
import {
  fetchMonopolyStore,
  authenticateMonopolyTeam,
  attachUtilityToProperty,
  upgradePropertyLevel,
  executeTeamWheelSpinAndPayRent,
  computeTeamSummary,
  supabase,
} from "../lib/monopolyService.js";
import {
  UtilityIcon,
  LandPlotIllustration,
  PropertyCategoryBackdrop,
} from "./LandPlotSvg.jsx";
import SpinWheelModal from "./SpinWheelModal.jsx";
import MonopolyPodiumLeaderboard from "./MonopolyPodiumLeaderboard.jsx";
import aesLogo from "../../assets/aes-logo.png";

export default function MarketMonopolyApp() {
  const navigate = useNavigate();
  const location = useLocation();

  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem("investomania_monopoly_theme") || "aes";
    } catch {
      return "aes";
    }
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try {
      localStorage.setItem("investomania_monopoly_theme", theme);
    } catch {}
  }, [theme]);

  const cycleTheme = () => {
    setTheme((prev) =>
      prev === "aes" ? "dark" : prev === "dark" ? "light" : "aes",
    );
  };

  const [store, setStore] = useState(null);

  // Persist session across page refreshes
  const [activeTeamId, setActiveTeamId] = useState(() => {
    try {
      return (
        sessionStorage.getItem("investomania_monopoly_team_id") ||
        localStorage.getItem("investomania_monopoly_team_id") ||
        ""
      );
    } catch {
      return "";
    }
  });
  const [activeTeamName, setActiveTeamName] = useState(() => {
    try {
      return (
        sessionStorage.getItem("investomania_monopoly_team_name") ||
        localStorage.getItem("investomania_monopoly_team_name") ||
        ""
      );
    } catch {
      return "";
    }
  });

  // Keep storage in sync whenever active team changes
  useEffect(() => {
    try {
      if (activeTeamId) {
        sessionStorage.setItem(
          "investomania_monopoly_team_id",
          String(activeTeamId),
        );
        localStorage.setItem(
          "investomania_monopoly_team_id",
          String(activeTeamId),
        );
      } else {
        sessionStorage.removeItem("investomania_monopoly_team_id");
        localStorage.removeItem("investomania_monopoly_team_id");
      }
      if (activeTeamName) {
        sessionStorage.setItem(
          "investomania_monopoly_team_name",
          activeTeamName,
        );
        localStorage.setItem("investomania_monopoly_team_name", activeTeamName);
      } else {
        sessionStorage.removeItem("investomania_monopoly_team_name");
        localStorage.removeItem("investomania_monopoly_team_name");
      }
    } catch {}
  }, [activeTeamId, activeTeamName]);

  const [loginName, setLoginName] = useState("");
  const [loginPasscode, setLoginPasscode] = useState("");
  const [loginError, setLoginError] = useState("");

  // Sync tab with URL: /market-monopoly/land, /market-monopoly/bank, etc.
  const validTabs = useMemo(
    () => ["land", "bank", "standings", "guide", "catalogue"],
    [],
  );
  const getTabFromPath = useCallback(() => {
    const segments = location.pathname.split("/").filter(Boolean);
    // Path looks like ['market-monopoly', 'tab-name']
    const lastSeg = segments[segments.length - 1];
    if (validTabs.includes(lastSeg)) return lastSeg;
    return "land";
  }, [location.pathname, validTabs]);

  const [activeTab, setActiveTabState] = useState(getTabFromPath);

  // When URL path changes, update state
  useEffect(() => {
    const tabFromUrl = getTabFromPath();
    if (tabFromUrl !== activeTab) {
      setActiveTabState(tabFromUrl);
    }
  }, [location.pathname, getTabFromPath, activeTab]);

  // Tab switch handler updates the URL
  const setActiveTab = useCallback(
    (newTab) => {
      setActiveTabState(newTab);
      navigate(`/market-monopoly/${newTab}`, { replace: true });
    },
    [navigate],
  );

  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [isSignOutModalOpen, setIsSignOutModalOpen] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("ALL");

  const [draggedUtilityId, setDraggedUtilityId] = useState(null);
  const [hoveredPropertyId, setHoveredPropertyId] = useState(null);

  const [contextMenu, setContextMenu] = useState(null);
  const [inspectedPropertyId, setInspectedPropertyId] = useState(null);
  const [previewLevelOverride, setPreviewLevelOverride] = useState(null);
  const [isWheelModalOpen, setIsWheelModalOpen] = useState(false);
  const [toast, setToast] = useState(null);

  const showToast = useCallback((message, type = "success") => {
    setToast({ id: Date.now(), message, type });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const refreshStore = useCallback(async (forceFresh = false) => {
    try {
      const loaded = await fetchMonopolyStore(forceFresh);
      setStore(loaded);
    } catch (err) {
      console.error("Supabase refreshStore error:", err);
    }
  }, []);

  useEffect(() => {
    refreshStore(true);

    const sub = supabase
      .channel("monopoly_client_updates")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "monopoly_state",
          filter: "id=eq.1",
        },
        () => {
          refreshStore(true);
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "monopoly_teams" },
        () => {
          refreshStore(true);
        },
      )
      .subscribe();

    // Lightweight fallback sync every 5 seconds (realtime handles instant updates)
    const poll = setInterval(() => {
      if (document.visibilityState === "visible") {
        refreshStore(false);
      }
    }, 5000);

    return () => {
      supabase.removeChannel(sub);
      clearInterval(poll);
    };
  }, [refreshStore]);

  useEffect(() => {
    const closeMenu = () => setContextMenu(null);
    window.addEventListener("click", closeMenu);
    return () => window.removeEventListener("click", closeMenu);
  }, []);

  const allTeamSummaries = useMemo(() => {
    if (!store) return [];
    return (store.teams || [])
      .map((t) => computeTeamSummary(t, store.properties))
      .sort((a, b) => b.netWorth - a.netWorth);
  }, [store]);

  const currentTeam = useMemo(() => {
    if ((!activeTeamId && !activeTeamName) || !allTeamSummaries.length)
      return null;
    return (
      allTeamSummaries.find(
        (t) =>
          (activeTeamId && String(t.id) === String(activeTeamId)) ||
          (activeTeamName &&
            t.name.toLowerCase() === activeTeamName.toLowerCase()) ||
          (activeTeamName &&
            t.username &&
            t.username.toLowerCase() === activeTeamName.toLowerCase()),
      ) || null
    );
  }, [activeTeamId, activeTeamName, allTeamSummaries]);

  const inspectedProperty = useMemo(() => {
    if (!store || !inspectedPropertyId) return null;
    return (
      store.properties.find(
        (p) => Number(p.id) === Number(inspectedPropertyId),
      ) || null
    );
  }, [store, inspectedPropertyId]);

  const contextProperty = useMemo(() => {
    if (!store || !contextMenu?.propertyId) return null;
    return (
      store.properties.find(
        (p) => Number(p.id) === Number(contextMenu.propertyId),
      ) || null
    );
  }, [store, contextMenu]);

  const handleSignIn = async (e) => {
    e.preventDefault();
    setLoginError("");
    try {
      const { team, store: latestStore } = await authenticateMonopolyTeam({
        identifier: loginName,
        passcode: loginPasscode,
      });
      if (latestStore) setStore(latestStore);
      setActiveTeamId(team.id);
      setActiveTeamName(team.name);
      showToast(`Signed in as ${team.name}`);
    } catch (err) {
      setLoginError(err.message || "Authentication failed.");
    }
  };

  const handleSignOut = () => {
    setActiveTeamId("");
    setActiveTeamName("");
    try {
      sessionStorage.removeItem("investomania_monopoly_team_id");
      sessionStorage.removeItem("investomania_monopoly_team_name");
      localStorage.removeItem("investomania_monopoly_team_id");
      localStorage.removeItem("investomania_monopoly_team_name");
    } catch {}
    setIsSignOutModalOpen(false);
  };

  const handleInstallUtility = async (propertyId, utilityId) => {
    if (!currentTeam) return;
    try {
      const updated = await attachUtilityToProperty({
        store,
        teamId: currentTeam.id,
        propertyId,
        utilityId,
      });
      setStore(updated);
      const util = KARACHI_UTILITIES.find(
        (u) => Number(u.id) === Number(utilityId),
      );
      const prop = store.properties.find(
        (p) => Number(p.id) === Number(propertyId),
      );
      showToast(`Added ${util?.name} to ${prop?.name}`);
    } catch (err) {
      showToast(err.message, "error");
    }
  };

  const handleUpgradeProperty = async (propertyId) => {
    if (!currentTeam) return;
    try {
      const updated = await upgradePropertyLevel({
        store,
        teamId: currentTeam.id,
        propertyId,
      });
      setStore(updated);
      const prop = updated.properties.find(
        (p) => Number(p.id) === Number(propertyId),
      );
      showToast(`${prop?.name} upgraded to Level ${prop?.upgradeLevel}`);
    } catch (err) {
      showToast(err.message, "error");
    }
  };

  const handleTeamSpinWheel = async (propertyId) => {
    if (!currentTeam) return store;
    const updated = await executeTeamWheelSpinAndPayRent({
      store,
      teamId: currentTeam.id,
      propertyId,
    });
    setStore(updated);
    const activeWave = Number(updated.currentWheelRound || 1);
    const spinRec = updated.wheelSpinsByRound?.[activeWave]?.[currentTeam.id];
    if (spinRec) {
      if (spinRec.status === "PAID_RENT") {
        showToast(
          `Landed on ${spinRec.propertyName}: Paid Rs ${spinRec.rentAmount}L rent to ${spinRec.ownerTeamName}`,
        );
      } else if (spinRec.status === "OWN_PROPERTY") {
        showToast(`Landed on your own property (${spinRec.propertyName})`);
      } else {
        showToast(`Landed on ${spinRec.propertyName} (Unowned)`);
      }
    }
    return updated;
  };

  const onDragStartUtility = (e, utilityId) => {
    setDraggedUtilityId(utilityId);
    e.dataTransfer.setData("text/plain", String(utilityId));
    e.dataTransfer.effectAllowed = "copy";
  };

  const onDragOverPlot = (e, propertyId) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    if (hoveredPropertyId !== propertyId) {
      setHoveredPropertyId(propertyId);
    }
  };

  const onDropOnPlot = (e, propertyId) => {
    e.preventDefault();
    const utilId = Number(
      e.dataTransfer.getData("text/plain") || draggedUtilityId,
    );
    setHoveredPropertyId(null);
    setDraggedUtilityId(null);
    if (utilId) {
      handleInstallUtility(propertyId, utilId);
    }
  };

  const onPlotContextMenu = (e, propertyId) => {
    e.preventDefault();
    e.stopPropagation();
    const x = Math.min(e.clientX, window.innerWidth - 280);
    const y = Math.min(e.clientY, window.innerHeight - 340);
    setContextMenu({ x, y, propertyId });
  };

  const filteredCatalogue = useMemo(() => {
    if (!store) return [];
    return store.properties.filter((p) => {
      const matchesCat =
        categoryFilter === "ALL" ||
        p.category.toLowerCase().includes(categoryFilter.toLowerCase());
      const matchesQuery =
        !searchQuery.trim() ||
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.zone.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.category.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCat && matchesQuery;
    });
  }, [store, categoryFilter, searchQuery]);

  if (!store) {
    return <EasyLoadingScreen message="Opening Market Monopoly..." />;
  }

  // =========================================================================
  // TEAM SIGN-IN VIEW (Matches Investomania LoginPage.jsx)
  // =========================================================================
  if (!currentTeam) {
    return (
      <div className="w-full min-h-screen flex flex-col justify-between p-4 sm:p-8">
        <header className="w-full max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-4 py-2">
          <div
            onClick={() => navigate("/")}
            className="flex items-center gap-2.5 sm:gap-3 cursor-pointer group select-none"
          >
            <img
              src={aesLogo}
              alt="Market Monopoly Logo"
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-full object-contain border border-[var(--border-soft)] p-1 bg-[var(--bg-card)] group-hover:scale-105 transition-transform shrink-0"
            />
            <span
              className="font-display text-lg sm:text-xl font-bold tracking-tight transition-colors"
              style={{
                color: theme === "light" ? "var(--text-main)" : "#F1CA7E",
              }}
            >
              Market Monopoly
            </span>
          </div>

          <div className="flex items-center justify-center gap-1.5 sm:gap-2 flex-wrap">
            <TactileButton
              onClick={() => navigate("/")}
              className="rounded-full px-3 sm:px-4 py-1.5 sm:py-2 text-[11px] sm:text-xs font-rounded font-semibold border transition-all cursor-pointer shadow-xs"
              style={{
                backgroundColor: theme === "aes" ? "#701020" : "var(--bg-card)",
                color: theme === "aes" ? "#F8EEE1" : "var(--text-main)",
                borderColor:
                  theme === "aes"
                    ? "rgba(241, 202, 126, 0.35)"
                    : "var(--border-soft)",
              }}
            >
              All Modules
            </TactileButton>
            <TactileButton
              onClick={cycleTheme}
              className="rounded-full px-3 sm:px-4 py-1.5 sm:py-2 text-[11px] sm:text-xs font-rounded font-semibold flex items-center gap-1.5 sm:gap-2 border transition-all cursor-pointer shadow-xs"
              style={{
                backgroundColor:
                  theme === "aes"
                    ? "#701020"
                    : theme === "dark"
                      ? "#240E15"
                      : "#FFFFFF",
                color:
                  theme === "aes"
                    ? "#F1CA7E"
                    : theme === "dark"
                      ? "#E8DCC6"
                      : "#5A0D1B",
                borderColor:
                  theme === "aes" ? "#F1CA7E" : "var(--theme-btn-border)",
              }}
            >
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{
                  backgroundColor:
                    theme === "aes"
                      ? "#F1CA7E"
                      : theme === "dark"
                        ? "#D9BB7C"
                        : "#881B30",
                }}
              />
              <span className="font-bold">
                {theme === "aes"
                  ? "AES Theme"
                  : theme === "dark"
                    ? "Dark Maroon"
                    : "White Theme"}
              </span>
            </TactileButton>
          </div>
        </header>

        <main className="my-auto py-8 w-full flex justify-center">
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="w-full max-w-md surface-box rounded-[36px] p-7 sm:p-9 space-y-6"
          >
            <div className="text-center space-y-2">
              <img
                src={aesLogo}
                alt="Market Monopoly Logo"
                className="w-16 h-16 mx-auto object-contain drop-shadow-md mb-1"
              />
              <div className="inline-flex items-center gap-2 rounded-full bg-[#5E1B21] text-[#D9BB7C] px-4 py-1 text-xs font-rounded font-bold">
                Team Desk
              </div>
              <h1
                className="font-display text-2xl sm:text-3xl"
                style={{ color: "var(--text-main)" }}
              >
                Sign In to Your Team
              </h1>
            </div>

            {loginError && (
              <div className="rounded-2xl bg-[#B83A3A]/15 border border-[#B83A3A]/40 px-4 py-2.5 text-xs font-rounded font-bold text-[#B83A3A] text-center">
                {loginError}
              </div>
            )}

            <form onSubmit={handleSignIn} className="space-y-4">
              <div className="space-y-1.5">
                <label
                  className="block text-xs font-rounded font-bold px-2"
                  style={{ color: "var(--text-sub)" }}
                >
                  Team Name
                </label>
                <input
                  type="text"
                  required
                  value={loginName}
                  onChange={(e) => setLoginName(e.target.value)}
                  placeholder="Enter Team Name"
                  className="w-full capsule-card rounded-full px-5 py-3 text-sm font-rounded font-semibold focus:outline-none"
                  style={{ color: "var(--text-main)" }}
                />
              </div>

              <div className="space-y-1.5">
                <label
                  className="block text-xs font-rounded font-bold px-2"
                  style={{ color: "var(--text-sub)" }}
                >
                  Team Passcode
                </label>
                <input
                  type="password"
                  required
                  value={loginPasscode}
                  onChange={(e) => setLoginPasscode(e.target.value)}
                  placeholder="Enter Passcode"
                  className="w-full capsule-card rounded-full px-5 py-3 text-sm font-rounded font-semibold focus:outline-none"
                  style={{ color: "var(--text-main)" }}
                />
              </div>

              <TactileButton
                type="submit"
                className="w-full rounded-full py-3.5 font-display font-bold text-sm shadow-lg btn-primary cursor-pointer"
              >
                Sign In
              </TactileButton>
            </form>
          </motion.div>
        </main>
      </div>
    );
  }

  // =========================================================================
  // MAIN WORKSPACE
  // =========================================================================
  const sidebarItems = [
    { id: "land", label: "My Land", badge: currentTeam.propertyCount },
    { id: "bank", label: "History", badge: store.transactions?.length || 0 },
    { id: "standings", label: "Rankings", badge: store.teams?.length || 0 },
    { id: "guide", label: "Rules", badge: "2R" },
    { id: "catalogue", label: "Info", badge: "25P·17R" },
  ];

  return (
    <div className="w-full min-h-screen lg:h-screen lg:overflow-hidden flex flex-col lg:flex-row p-0">
      {/* FIXED ANCHORED LEFT SIDEBAR */}
      <div className="w-full lg:w-64 xl:w-72 lg:h-full shrink-0 p-3 sm:p-4 lg:p-5 lg:pr-0 flex flex-col z-30">
        <aside className="surface-box rounded-[24px] sm:rounded-[28px] lg:rounded-[32px] p-3.5 sm:p-4 flex flex-col justify-between w-full h-full shrink-0 gap-2.5 sm:gap-3 shadow-lg">
          <div className="flex flex-col items-stretch gap-2.5 sm:gap-3 w-full min-h-0 flex-1">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3 w-full shrink-0">
              <div
                onClick={() => navigate("/")}
                className="flex items-center gap-2.5 sm:gap-3 px-1 pt-1 shrink-0 cursor-pointer group"
              >
                <img
                  src={aesLogo}
                  alt="Market Monopoly"
                  className="w-8 h-8 sm:w-11 sm:h-11 rounded-xl sm:rounded-2xl object-contain shrink-0 shadow-sm group-hover:scale-105 transition-transform p-1 bg-[var(--bg-card)] border border-[var(--border-soft)]"
                />
                <div className="block min-w-0">
                  <div
                    className="font-display text-sm sm:text-lg font-bold leading-tight truncate"
                    style={{ color: "var(--text-main)" }}
                  >
                    Market Monopoly
                  </div>
                  <span
                    className="text-[10px] sm:text-xs font-rounded font-semibold block truncate"
                    style={{ color: "var(--text-sub)" }}
                  >
                    Round {store.currentRound}
                  </span>
                </div>
              </div>

              <div className="flex lg:hidden items-center justify-end gap-1.5 sm:gap-2 shrink-0">
                <TactileButton
                  onClick={() => setIsMobileNavOpen(true)}
                  className="rounded-full py-1.5 px-3 text-[11px] sm:text-xs font-rounded font-bold border transition-all cursor-pointer shadow-sm"
                  style={{
                    backgroundColor: "var(--tab-active-bg)",
                    color: "var(--tab-active-text)",
                    borderColor: "var(--border-active)",
                  }}
                >
                  Menu
                </TactileButton>

                <TactileButton
                  onClick={cycleTheme}
                  className="rounded-full py-1.5 px-2.5 text-xs font-rounded font-semibold flex items-center justify-center gap-1 border transition-all cursor-pointer"
                  style={{
                    backgroundColor: "var(--theme-btn-bg)",
                    color: "var(--theme-btn-text)",
                    borderColor: "var(--theme-btn-border)",
                  }}
                >
                  {theme === "aes" ? (
                    <IconSun className="w-3.5 h-3.5 text-[#89192C]" />
                  ) : theme === "dark" ? (
                    <IconSun className="w-3.5 h-3.5 text-[#D9BB7C]" />
                  ) : (
                    <IconMoon className="w-3.5 h-3.5 text-[#6B1527]" />
                  )}
                </TactileButton>

                <TactileButton
                  onClick={() => setIsSignOutModalOpen(true)}
                  style={{
                    backgroundColor: "var(--btn-signout-bg)",
                    color: "var(--btn-signout-text)",
                    borderColor: "var(--btn-signout-border)",
                  }}
                  className="rounded-full py-1.5 px-2.5 text-[11px] sm:text-xs font-rounded font-bold text-center transition-all border cursor-pointer shrink-0"
                >
                  Sign Out
                </TactileButton>
              </div>
            </div>

            {/* Desktop Team Summary Capsule */}
            <div className="capsule-card rounded-[24px] p-3.5 hidden lg:block border border-[var(--border-soft)] shrink-0 space-y-1">
              <div className="flex items-center justify-between text-xs font-rounded">
                <span
                  className="font-bold truncate"
                  style={{ color: "var(--text-main)" }}
                >
                  {currentTeam.name}
                </span>
                <span className="inline-flex items-center gap-1 text-[#2E7D52] font-bold">
                  <span className="w-2 h-2 rounded-full bg-[#2E7D52]" /> Active
                </span>
              </div>
              <div
                className="flex items-center justify-between text-xs font-rounded font-bold"
                style={{ color: "var(--text-sub)" }}
              >
                <span>Available Cash:</span>
                <strong
                  className="font-mono"
                  style={{ color: "var(--text-main)" }}
                >
                  Rs {currentTeam.cash}L
                </strong>
              </div>
              <div className="flex items-center justify-between text-xs font-rounded font-bold text-[#C0392B]">
                <span>Deducted Money:</span>
                <strong className="font-mono">
                  -Rs {currentTeam.totalDeducted || 0}L
                </strong>
              </div>
              <div className="flex items-center justify-between text-xs font-rounded text-[#2E7D52] font-bold">
                <span>Portfolio Value:</span>
                <strong className="font-mono">
                  Rs {currentTeam.netWorth}L
                </strong>
              </div>
            </div>

            {/* Desktop Navigation Pills */}
            <nav className="hidden lg:flex flex-col gap-2 overflow-y-auto no-scrollbar w-full py-1 flex-1 min-h-0 pr-0.5">
              {sidebarItems.map((item) => {
                const active = activeTab === item.id;
                return (
                  <TactileButton
                    key={item.id}
                    onClick={() => setActiveTab(item.id)}
                    className={`w-full whitespace-nowrap rounded-full px-4 py-2.5 flex items-center justify-between gap-2.5 text-xs font-rounded font-bold transition-all shrink-0 ${
                      active
                        ? "border-2 border-[var(--border-active)] shadow-sm"
                        : "border-2 border-transparent opacity-80 text-[var(--text-sub)] hover:text-[var(--text-main)] hover:bg-[var(--row-hover)]"
                    }`}
                    style={
                      active
                        ? {
                            backgroundColor: "var(--tab-active-bg)",
                            color: "var(--tab-active-text)",
                          }
                        : {}
                    }
                  >
                    <span className="truncate">{item.label}</span>
                    <span
                      className="rounded-full px-2 py-0.5 text-xs font-mono font-bold shrink-0"
                      style={
                        active
                          ? {
                              backgroundColor: "var(--tab-badge-bg)",
                              color: "var(--tab-badge-text)",
                            }
                          : {
                              backgroundColor: "var(--bg-inset)",
                              color: "var(--text-sub)",
                            }
                      }
                    >
                      {item.badge}
                    </span>
                  </TactileButton>
                );
              })}
            </nav>
          </div>

          <div className="hidden lg:flex flex-col gap-2 pt-3 border-t border-[var(--border-soft)] w-full shrink-0">
            <TactileButton
              onClick={cycleTheme}
              className="w-full rounded-full py-2.5 px-3 text-xs font-rounded font-semibold flex items-center justify-center gap-2 border transition-all cursor-pointer"
              style={{
                backgroundColor: "var(--theme-btn-bg)",
                color: "var(--theme-btn-text)",
                borderColor: "var(--theme-btn-border)",
              }}
            >
              {theme === "aes" ? (
                <>
                  <IconSun className="w-4 h-4 text-[#89192C]" />
                  <span className="font-bold">AES Theme</span>
                </>
              ) : theme === "dark" ? (
                <>
                  <IconSun className="w-4 h-4 text-[#D9BB7C]" />
                  <span className="font-bold">Dark Maroon</span>
                </>
              ) : (
                <>
                  <IconMoon className="w-4 h-4 text-[#6B1527]" />
                  <span className="font-bold">White Theme</span>
                </>
              )}
            </TactileButton>

            <TactileButton
              onClick={() => setIsSignOutModalOpen(true)}
              style={{
                backgroundColor: "var(--btn-signout-bg)",
                color: "var(--btn-signout-text)",
                borderColor: "var(--btn-signout-border)",
              }}
              className="w-full rounded-full py-2.5 px-3 text-xs font-rounded font-bold text-center transition-all border cursor-pointer hover:brightness-105"
            >
              Sign Out
            </TactileButton>
          </div>
        </aside>
      </div>

      {/* MAIN WORKSPACE */}
      <main className="flex-1 min-w-0 w-full lg:h-full lg:overflow-y-auto screen-scrollbar p-3 sm:p-4 lg:py-5 lg:pl-5 lg:pr-16 xl:pr-20 space-y-5">
        {/* COMPACT TOP PORTFOLIO BAR */}
        <div className="surface-box rounded-[28px] p-4 shadow-sm border border-[var(--border-card)] flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-[#b81434]/15 text-[var(--border-active)] flex items-center justify-center shrink-0 border border-[var(--border-soft)]">
              <IconCalendar className="w-4 h-4 text-[var(--border-active)]" />
            </div>
            <div>
              <span className="text-[10px] font-rounded text-[var(--text-sub)] uppercase font-bold tracking-wider block">
                Round {store.currentRound} of 2
              </span>
              <h2
                className="text-base sm:text-lg font-bold font-display"
                style={{ color: "var(--text-main)" }}
              >
                {store.currentRound === 1
                  ? "Property Auction"
                  : "Land & Utilities"}
              </h2>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
            <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-2xl capsule-card border border-[var(--border-soft)]">
              <IconWallet className="w-3.5 h-3.5 text-[var(--border-active)] shrink-0" />
              <span className="text-xs font-bold font-mono text-[var(--text-main)] tabular-nums">
                Cash: Rs {currentTeam.cash}L
              </span>
            </div>

            <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-2xl capsule-card border border-[var(--border-soft)]">
              <span className="text-xs font-bold font-mono text-[#C0392B] tabular-nums">
                Deducted: -Rs {currentTeam.totalDeducted || 0}L
              </span>
            </div>

            <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-2xl capsule-card border border-[var(--border-soft)]">
              <IconBriefcase className="w-3.5 h-3.5 text-[#2E7D52] shrink-0" />
              <span className="text-xs font-bold font-mono text-[var(--text-main)] tabular-nums">
                Properties: {currentTeam.propertyCount} · Resources:{" "}
                {(currentTeam.ownedResources || []).length}
              </span>
            </div>

            <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-2xl capsule-card border border-[var(--border-soft)]">
              <IconTrendingUp className="w-3.5 h-3.5 text-[#2E7D52] shrink-0" />
              <span className="text-xs font-bold font-mono text-[#2E7D52] tabular-nums">
                Portfolio: Rs {currentTeam.netWorth}L
              </span>
            </div>
          </div>
        </div>

        {/* TAB CONTENT */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
            className="w-full"
          >
            {/* ================================================================= */}
            {/* TAB 1: MY LAND (9 Cols, Extra Tall) + UTILITIES SHOP (3 Cols)     */}
            {/* ================================================================= */}
            {activeTab === "land" && (
              <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-stretch">
                {/* LEFT 9 COLS: BIG UNIFIED KARACHI LAND GRID BOARD */}
                <div className="xl:col-span-9 flex flex-col">
                  <div className="surface-box rounded-[28px] p-5 border border-[var(--border-card)] min-h-[700px] lg:min-h-[760px] flex flex-col gap-4">
                    <div className="flex flex-wrap items-center justify-between border-b border-[var(--border-soft)] pb-3 shrink-0 gap-2">
                      <div>
                        <h3
                          className="font-display text-lg font-bold"
                          style={{ color: "var(--text-main)" }}
                        >
                          Karachi Master Land Grid ({currentTeam.propertyCount}{" "}
                          Owned Plots)
                        </h3>
                        <p
                          className="text-[11px] font-rounded"
                          style={{ color: "var(--text-sub)" }}
                        >
                          Click any property plot on the grid to inspect info,
                          view Level 1–3 progression, or attach Bid Resources.
                        </p>
                      </div>
                      <span
                        className="capsule-inset font-mono text-xs font-bold px-3 py-1 rounded-full"
                        style={{ color: "var(--text-main)" }}
                      >
                        Rent Power: Rs {currentTeam.totalRentPower}L
                      </span>
                    </div>

                    {/* BIG UNIFIED LAND ESTATE GRID SURFACE */}
                    <div
                      className="flex-1 rounded-[24px] p-4 sm:p-5 border-2 relative overflow-hidden flex flex-col justify-between capsule-inset"
                      style={{
                        borderColor: "var(--border-card)",
                        backgroundColor: "var(--bg-inset)",
                      }}
                    >
                      {/* Subtle Architectural Survey Grid Lines Overlay (Theme-Adaptive) */}
                      <div
                        className="absolute inset-0 pointer-events-none opacity-60"
                        style={{
                          backgroundImage:
                            "linear-gradient(to right, var(--chart-grid) 1px, transparent 1px), linear-gradient(to bottom, var(--chart-grid) 1px, transparent 1px)",
                          backgroundSize: "44px 44px",
                        }}
                      />

                      {currentTeam.ownedProperties.length === 0 ? (
                        <div className="relative z-10 flex-1 flex flex-col items-center justify-center text-center p-8 gap-2">
                          <div className="w-48 h-28 rounded-2xl overflow-hidden border border-[var(--border-card)] opacity-85">
                            <LandPlotIllustration
                              category="Residential"
                              level={0}
                              showBadge={false}
                            />
                          </div>
                          <span
                            className="font-display text-base font-bold"
                            style={{ color: "var(--text-main)" }}
                          >
                            Your Land Grid is Vacant
                          </span>
                          <span
                            className="text-xs font-rounded max-w-sm"
                            style={{ color: "var(--text-sub)" }}
                          >
                            Acquire properties from the Wheel Spin or Admin Bid
                            to place them onto your Karachi Master Land Grid.
                          </span>
                        </div>
                      ) : (
                        <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-4 content-start">
                          {currentTeam.ownedProperties.map((prop) => {
                            const val = computePropertyValuation(prop);
                            const rent = computePropertyRent(prop);
                            const attachedIds = Array.isArray(
                              prop.attachedUtilities,
                            )
                              ? prop.attachedUtilities
                              : [];
                            const lvl = Math.min(
                              3,
                              Math.max(
                                Number(prop.upgradeLevel || 0),
                                attachedIds.length,
                              ),
                            );
                            const isDropTarget = hoveredPropertyId === prop.id;
                            const isSelected =
                              Number(inspectedPropertyId) === Number(prop.id);

                            return (
                              <div
                                key={prop.id}
                                onClick={() => setInspectedPropertyId(prop.id)}
                                onDragOver={(e) => onDragOverPlot(e, prop.id)}
                                onDragLeave={() => setHoveredPropertyId(null)}
                                onDrop={(e) => onDropOnPlot(e, prop.id)}
                                onContextMenu={(e) =>
                                  onPlotContextMenu(e, prop.id)
                                }
                                className={`group relative rounded-2xl p-3 transition-all cursor-pointer select-none border-2 capsule-card flex flex-col gap-2.5 ${
                                  isDropTarget
                                    ? "scale-[1.02] shadow-2xl ring-2 ring-[#ECC37A]"
                                    : isSelected
                                      ? "shadow-xl ring-2 ring-[var(--border-active)]"
                                      : "hover:shadow-lg"
                                }`}
                                style={{
                                  backgroundColor: "var(--bg-card)",
                                  borderColor:
                                    isDropTarget || isSelected
                                      ? "var(--border-active)"
                                      : "var(--border-card)",
                                }}
                              >
                                {/* Plot Title & Options Header */}
                                <div className="flex items-center justify-between gap-2">
                                  <h4
                                    className="font-display text-sm font-bold truncate"
                                    style={{ color: "var(--text-main)" }}
                                  >
                                    {prop.name}
                                  </h4>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setInspectedPropertyId(prop.id);
                                    }}
                                    className="px-2.5 py-0.5 rounded-full text-[10px] font-rounded font-bold bg-[#701020] text-[#F1CA7E] hover:opacity-90 transition-opacity shrink-0"
                                  >
                                    Options
                                  </button>
                                </div>

                                {/* 3D Isometric Plot Tile */}
                                <div className="relative rounded-xl overflow-hidden">
                                  <LandPlotIllustration
                                    category={prop.category}
                                    level={lvl}
                                    utilityCount={attachedIds.length}
                                    isHighlighted={isDropTarget || isSelected}
                                  />
                                  <div className="absolute top-2 left-2 right-2 flex items-center justify-between gap-1.5 pointer-events-none">
                                    <span className="text-[10px] font-rounded font-bold px-2 py-0.5 rounded-md bg-black/80 text-[#F8EEE1] border border-[#F1CA7E]/40">
                                      #{prop.id} · {prop.category}
                                    </span>
                                    <span className="text-[10px] font-rounded font-bold px-2 py-0.5 rounded-md bg-[#2E7D52] text-white shadow-sm truncate max-w-[110px]">
                                      Lvl {lvl}/3
                                    </span>
                                  </div>
                                </div>

                                {/* Financial Info & Rent Capsule */}
                                <div className="capsule-inset rounded-xl p-2 grid grid-cols-2 gap-1.5 text-[10px] font-mono">
                                  <div>
                                    <span
                                      className="text-[9px] font-rounded block opacity-75"
                                      style={{ color: "var(--text-sub)" }}
                                    >
                                      Base Price
                                    </span>
                                    <strong
                                      style={{ color: "var(--text-main)" }}
                                    >
                                      Rs {prop.openingValue}L
                                    </strong>
                                  </div>
                                  <div>
                                    <span
                                      className="text-[9px] font-rounded block opacity-75"
                                      style={{ color: "var(--text-sub)" }}
                                    >
                                      Initial Rent
                                    </span>
                                    <strong
                                      style={{ color: "var(--text-main)" }}
                                    >
                                      Rs {prop.rentValues?.[0] || 15}L
                                    </strong>
                                  </div>
                                  <div>
                                    <span
                                      className="text-[9px] font-rounded block opacity-75"
                                      style={{ color: "var(--text-sub)" }}
                                    >
                                      Auctioned Price
                                    </span>
                                    <strong className="text-[#2E7D52]">
                                      Rs{" "}
                                      {Number(prop.purchasePrice) > 0
                                        ? prop.purchasePrice
                                        : prop.openingValue}
                                      L
                                    </strong>
                                  </div>
                                  <div>
                                    <span
                                      className="text-[9px] font-rounded block opacity-75"
                                      style={{ color: "var(--text-sub)" }}
                                    >
                                      Current Rentt
                                    </span>
                                    <strong className="text-[#2E7D52]">
                                      Rs {rent}L
                                    </strong>
                                  </div>
                                </div>

                                {/* LEVEL PROGRESS BAR (1–3 Resources) */}
                                <div className="capsule-inset rounded-xl px-3 py-2 space-y-1.5">
                                  <div className="flex items-center justify-between text-[10px] font-rounded font-bold">
                                    <span style={{ color: "var(--text-sub)" }}>
                                      Level Progress ({attachedIds.length}/3
                                      Resources)
                                    </span>
                                    <span className="text-[#2E7D52]">
                                      {lvl >= 3
                                        ? "Level 3 Max"
                                        : `Level ${lvl} / 3`}
                                    </span>
                                  </div>
                                  <div className="grid grid-cols-3 gap-1.5">
                                    {[1, 2, 3].map((step) => (
                                      <div
                                        key={step}
                                        className={`h-2 rounded-full transition-all ${
                                          lvl >= step
                                            ? "bg-[#2E7D52]"
                                            : "bg-black/15 dark:bg-white/15"
                                        }`}
                                      />
                                    ))}
                                  </div>
                                </div>

                                {/* Attached Resource Badges */}
                                {attachedIds.length > 0 && (
                                  <div className="flex items-center gap-1 flex-wrap">
                                    {attachedIds.map((uId) => {
                                      const util = KARACHI_UTILITIES.find(
                                        (u) => u.id === Number(uId),
                                      );
                                      if (!util) return null;
                                      return (
                                        <span
                                          key={uId}
                                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-rounded font-bold"
                                          style={{
                                            backgroundColor:
                                              "var(--resource-badge-bg)",
                                            color: "var(--resource-badge-text)",
                                          }}
                                        >
                                          <UtilityIcon
                                            id={util.id}
                                            className="w-2.5 h-2.5"
                                          />
                                          <span className="truncate max-w-[90px]">
                                            {util.name}
                                          </span>
                                        </span>
                                      );
                                    })}
                                  </div>
                                )}

                                {/* Bottom Action Footer */}
                                <div className="mt-auto pt-1 flex items-center justify-between gap-2 text-[10px] font-rounded font-bold">
                                  {lvl >= 3 ? (
                                    <span style={{ color: "var(--text-sub)" }}>
                                      Maximum Level 3 Reached
                                    </span>
                                  ) : (
                                    <span className="text-[#2E7D52]">
                                      + Click or Drag Resource to Upgrade
                                    </span>
                                  )}
                                  <span
                                    className="capsule-inset px-2.5 py-0.5 rounded-full text-[10px] font-rounded font-bold"
                                    style={{ color: "var(--text-main)" }}
                                  >
                                    Info
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Grid Legend Footer */}
                      <div
                        className="relative z-10 mt-4 pt-3 border-t border-[var(--border-soft)] flex flex-wrap items-center justify-between gap-2 text-[11px] font-rounded"
                        style={{ color: "var(--text-sub)" }}
                      >
                        <div className="flex items-center gap-4">
                          <span className="flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-full bg-[#ECC37A] border border-black/20 inline-block" />
                            <span style={{ color: "var(--text-main)" }}>
                              Level 1–3 3D Plots
                            </span>
                          </span>
                          <span className="flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-full bg-[#2E7D52] inline-block" />
                            <span>
                              Click any plot to inspect full info & attach
                              resources
                            </span>
                          </span>
                        </div>
                        <span
                          className="font-mono text-[10px] font-bold"
                          style={{ color: "var(--text-main)" }}
                        >
                          Total Plots on Grid:{" "}
                          {currentTeam.ownedProperties.length} / 25
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* RIGHT 3 COLS: YOUR BID RESOURCES (DRAG TO LAND TO LEVEL UP) */}
                <div className="xl:col-span-3 flex flex-col">
                  <div className="surface-box rounded-[28px] p-4 border border-[var(--border-card)] min-h-[700px] lg:min-h-[760px] flex flex-col gap-3">
                    <div className="flex items-center justify-between border-b border-[var(--border-soft)] pb-2.5 shrink-0">
                      <h3
                        className="font-display text-sm font-bold"
                        style={{ color: "var(--text-main)" }}
                      >
                        Your Bid Resources (
                        {
                          (currentTeam.ownedResources || []).filter(
                            (r) => !r.attachedToPropertyId,
                          ).length
                        }
                        )
                      </h3>
                      <span className="text-[10px] font-rounded font-bold px-2 py-0.5 rounded-full bg-[#701020] text-[#F1CA7E]">
                        Drag to Level Up
                      </span>
                    </div>

                    <div className="space-y-2 overflow-y-auto modal-scrollbar pr-1 flex-1">
                      {(currentTeam.ownedResources || []).filter(
                        (r) => !r.attachedToPropertyId,
                      ).length === 0 ? (
                        <div className="p-4 rounded-2xl capsule-inset text-center space-y-1">
                          <span
                            className="block text-xs font-rounded font-bold"
                            style={{ color: "var(--text-main)" }}
                          >
                            No Unassigned Resources
                          </span>
                          <span
                            className="block text-[11px] font-rounded"
                            style={{ color: "var(--text-sub)" }}
                          >
                            Win resources in the Admin Bid to drag them onto
                            your land plots and level up.
                          </span>
                        </div>
                      ) : (
                        (currentTeam.ownedResources || [])
                          .filter((r) => !r.attachedToPropertyId)
                          .map((res) => (
                            <div
                              key={res.instanceId}
                              draggable
                              onDragStart={(e) =>
                                onDragStartUtility(e, res.utilityId)
                              }
                              onDragEnd={() => {
                                setDraggedUtilityId(null);
                                setHoveredPropertyId(null);
                              }}
                              className="p-2.5 rounded-2xl capsule-card border-2 border-[#2E7D52]/50 hover:border-[var(--border-active)] transition-all cursor-grab active:cursor-grabbing flex items-center justify-between gap-2"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <div
                                  className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 border transition-colors"
                                  style={{
                                    backgroundColor: "var(--resource-icon-bg)",
                                    borderColor: "var(--resource-badge-border)",
                                  }}
                                >
                                  <UtilityIcon
                                    id={res.utilityId}
                                    className="w-3.5 h-3.5"
                                    style={{
                                      color: "var(--resource-icon-color)",
                                    }}
                                  />
                                </div>
                                <div className="min-w-0">
                                  <span
                                    className="text-xs font-rounded font-bold truncate block"
                                    style={{ color: "var(--text-main)" }}
                                  >
                                    {res.name}
                                  </span>
                                  <span className="text-[10px] font-mono text-[#2E7D52] block">
                                    Won in Bid (Rs {res.bidPrice}L) · +1 Lvl
                                  </span>
                                </div>
                              </div>

                              {currentTeam.ownedProperties.length > 0 && (
                                <TactileButton
                                  onClick={() => {
                                    const targetProp =
                                      currentTeam.ownedProperties.find(
                                        (p) =>
                                          (p.attachedUtilities || []).length <
                                            3 &&
                                          !(p.attachedUtilities || []).includes(
                                            res.utilityId,
                                          ),
                                      ) || currentTeam.ownedProperties[0];
                                    handleInstallUtility(
                                      targetProp.id,
                                      res.utilityId,
                                    );
                                  }}
                                  className="px-2.5 py-1 rounded-full text-[10px] font-rounded font-bold btn-primary shrink-0"
                                >
                                  Attach
                                </TactileButton>
                              )}
                            </div>
                          ))
                      )}

                      {/* All 17 Bid Resources Catalogue (Bid-Only Reference) */}
                      <div className="pt-3 border-t border-[var(--border-soft)] space-y-1.5">
                        <span
                          className="text-[10px] font-mono uppercase font-bold block px-1"
                          style={{ color: "var(--text-sub)" }}
                        >
                          All 17 Bid Resources Pool
                        </span>
                        {KARACHI_UTILITIES.map((util) => {
                          const ownedReady = (
                            currentTeam.ownedResources || []
                          ).some(
                            (r) =>
                              Number(r.utilityId) === Number(util.id) &&
                              !r.attachedToPropertyId,
                          );
                          return (
                            <div
                              key={util.id}
                              className="p-2 rounded-xl capsule-inset flex items-center justify-between gap-2 opacity-85"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <div
                                  className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 border transition-colors"
                                  style={{
                                    backgroundColor: "var(--resource-icon-bg)",
                                    borderColor: "var(--resource-badge-border)",
                                  }}
                                >
                                  <UtilityIcon
                                    id={util.id}
                                    className="w-3 h-3"
                                    style={{
                                      color: "var(--resource-icon-color)",
                                    }}
                                  />
                                </div>
                                <span
                                  className="text-[11px] font-rounded font-semibold truncate"
                                  style={{ color: "var(--text-main)" }}
                                >
                                  {util.name}
                                </span>
                              </div>
                              <span
                                className="font-mono text-[10px] font-bold shrink-0"
                                style={{
                                  color: ownedReady
                                    ? "#2E7D52"
                                    : "var(--text-sub)",
                                }}
                              >
                                {ownedReady ? "Owned" : `Bid ~${util.cost}L`}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ================================================================= */}
            {/* TAB 3: BANK HISTORY (BIG & INFORMATIVE PORTFOLIO LEDGER)          */}
            {/* ================================================================= */}
            {activeTab === "bank" &&
              (() => {
                const allTxs = Array.isArray(store.transactions)
                  ? store.transactions
                  : [];
                const teamOwnedProps = currentTeam.ownedProperties || [];
                const teamOwnedResources = Array.isArray(
                  currentTeam.ownedResources,
                )
                  ? currentTeam.ownedResources
                  : [];
                const propTransactions = allTxs.filter(
                  (tx) =>
                    tx.type === "AUCTION_WIN" ||
                    tx.type === "SALE_REVOKED" ||
                    tx.category === "PROPERTY",
                );
                const resourceTransactions = allTxs.filter(
                  (tx) =>
                    tx.type === "RESOURCE_BID_WIN" ||
                    tx.type === "RESOURCE_REVOKED" ||
                    tx.type === "RESOURCE_LEVEL_UP" ||
                    tx.category === "RESOURCE",
                );

                return (
                  <div className="space-y-5">
                    {/* 1. PORTFOLIO MONEY & DEDUCTED MONEY SUMMARY BANNER */}
                    <div className="surface-box rounded-[28px] p-5 sm:p-6 border border-[var(--border-card)] space-y-4">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[var(--border-soft)] pb-3">
                        <div>
                          <span
                            className="text-xs font-mono uppercase font-bold tracking-wider block"
                            style={{ color: "var(--text-sub)" }}
                          >
                            {currentTeam.name} · Financial & Asset Ledger
                          </span>
                          <h3
                            className="font-display text-xl sm:text-2xl font-bold"
                            style={{ color: "var(--text-main)" }}
                          >
                            Money, Deducted Money & Portfolio History
                          </h3>
                        </div>
                        <span className="px-3.5 py-1.5 rounded-full text-xs font-mono font-bold bg-[#701020] text-[#F1CA7E] self-start sm:self-auto">
                          Starting Budget: Rs{" "}
                          {currentTeam.startingBudget || 500}L
                        </span>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                        <div className="p-4 rounded-2xl capsule-card border border-[var(--border-soft)] space-y-1">
                          <span
                            className="text-[11px] font-rounded font-bold uppercase block"
                            style={{ color: "var(--text-sub)" }}
                          >
                            Available Money
                          </span>
                          <strong
                            className="font-mono text-lg sm:text-xl font-bold block"
                            style={{ color: "var(--text-main)" }}
                          >
                            Rs {currentTeam.cash}L
                          </strong>
                          <span
                            className="text-[10px] font-mono block"
                            style={{ color: "var(--text-sub)" }}
                          >
                            From Rs {currentTeam.startingBudget || 500}L start
                          </span>
                        </div>

                        <div className="p-4 rounded-2xl capsule-card border border-[#C0392B]/40 space-y-1">
                          <span className="text-[11px] font-rounded font-bold uppercase block text-[#C0392B]">
                            Total Deducted Money
                          </span>
                          <strong className="font-mono text-lg sm:text-xl font-bold block text-[#C0392B]">
                            -Rs {currentTeam.totalDeducted || 0}L
                          </strong>
                          <span
                            className="text-[10px] font-mono block"
                            style={{ color: "var(--text-sub)" }}
                          >
                            Props: {currentTeam.propertySpent || 0}L · Res:{" "}
                            {currentTeam.resourceSpent || 0}L
                          </span>
                        </div>

                        <div className="p-4 rounded-2xl capsule-card border border-[var(--border-soft)] space-y-1">
                          <span
                            className="text-[11px] font-rounded font-bold uppercase block"
                            style={{ color: "var(--text-sub)" }}
                          >
                            Properties Portfolio ({teamOwnedProps.length})
                          </span>
                          <strong className="font-mono text-lg sm:text-xl font-bold block text-[#2E7D52]">
                            Rs {currentTeam.propertyValuation}L
                          </strong>
                          <span
                            className="text-[10px] font-mono block"
                            style={{ color: "var(--text-sub)" }}
                          >
                            Rent Power: Rs {currentTeam.totalRentPower}L
                          </span>
                        </div>

                        <div className="p-4 rounded-2xl capsule-card border border-[var(--border-soft)] space-y-1">
                          <span
                            className="text-[11px] font-rounded font-bold uppercase block"
                            style={{ color: "var(--text-sub)" }}
                          >
                            Resources Received ({teamOwnedResources.length})
                          </span>
                          <strong
                            className="font-mono text-lg sm:text-xl font-bold block"
                            style={{ color: "var(--text-main)" }}
                          >
                            Rs {currentTeam.resourceSpent || 0}L
                          </strong>
                          <span
                            className="text-[10px] font-mono block"
                            style={{ color: "var(--text-sub)" }}
                          >
                            {
                              teamOwnedResources.filter(
                                (r) => r.attachedToPropertyId,
                              ).length
                            }{" "}
                            Attached ·{" "}
                            {
                              teamOwnedResources.filter(
                                (r) => !r.attachedToPropertyId,
                              ).length
                            }{" "}
                            Ready
                          </span>
                        </div>

                        <div className="p-4 rounded-2xl capsule-card border-2 border-[#2E7D52] space-y-1 col-span-2 md:col-span-1">
                          <span className="text-[11px] font-rounded font-bold uppercase block text-[#2E7D52]">
                            Total Net Worth
                          </span>
                          <strong className="font-mono text-lg sm:text-xl font-bold block text-[#2E7D52]">
                            Rs {currentTeam.netWorth}L
                          </strong>
                          <span
                            className="text-[10px] font-mono block"
                            style={{ color: "var(--text-sub)" }}
                          >
                            Cash + Land + Resources
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* 2. SIDE-BY-SIDE HEADLINES: PROPERTIES RECEIVED vs RESOURCES RECEIVED */}
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                      {/* PROPERTIES HEADLINE SECTION */}
                      <div className="surface-box rounded-[28px] p-5 border border-[var(--border-card)] space-y-4">
                        <div className="flex items-center justify-between border-b border-[var(--border-soft)] pb-3">
                          <div>
                            <span className="text-[10px] font-mono uppercase font-bold text-[#2E7D52] block">
                              Properties Headline
                            </span>
                            <h4
                              className="font-display text-lg font-bold"
                              style={{ color: "var(--text-main)" }}
                            >
                              Properties You Received ({teamOwnedProps.length})
                            </h4>
                          </div>
                          <span className="px-3 py-1 rounded-full text-xs font-mono font-bold capsule-inset text-[#C0392B]">
                            Deducted: -Rs {currentTeam.propertySpent || 0}L
                          </span>
                        </div>

                        {teamOwnedProps.length === 0 ? (
                          <div className="p-6 rounded-2xl capsule-inset text-center">
                            <p
                              className="text-xs font-rounded font-bold"
                              style={{ color: "var(--text-sub)" }}
                            >
                              No properties received yet. When the Admin assigns
                              properties to {currentTeam.name}, they appear here
                              with their price and rent details.
                            </p>
                          </div>
                        ) : (
                          <div className="space-y-2.5 max-h-[380px] overflow-y-auto modal-scrollbar pr-1">
                            {teamOwnedProps.map((prop) => {
                              const val = computePropertyValuation(prop);
                              const rent = computePropertyRent(prop);
                              const paid = Number(
                                prop.purchasePrice || prop.openingValue || 0,
                              );
                              const lvl = Math.min(
                                3,
                                Math.max(0, Number(prop.upgradeLevel || 0)),
                              );
                              return (
                                <div
                                  key={prop.id}
                                  className="p-4 rounded-2xl capsule-card border border-[var(--border-soft)] flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                                >
                                  <div className="space-y-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[#701020] text-[#F1CA7E]">
                                        #{prop.id} · {prop.category}
                                      </span>
                                      <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[#2E7D52]/15 text-[#2E7D52]">
                                        Level {lvl}/3
                                      </span>
                                    </div>
                                    <h5
                                      className="font-display text-base font-bold"
                                      style={{ color: "var(--text-main)" }}
                                    >
                                      You received {prop.name}
                                    </h5>
                                    <p
                                      className="text-xs font-rounded"
                                      style={{ color: "var(--text-sub)" }}
                                    >
                                      Current Valuation:{" "}
                                      <strong className="text-[#2E7D52]">
                                        Rs {val}L
                                      </strong>{" "}
                                      · Rent Power: <strong>Rs {rent}L</strong>
                                    </p>
                                  </div>

                                  <div className="text-left sm:text-right shrink-0 font-mono">
                                    <span className="text-xs font-bold text-[#C0392B] block">
                                      -Rs {paid}L Deducted
                                    </span>
                                    <span className="text-[11px] text-[#2E7D52] font-bold block">
                                      +Rs {val}L Asset Value
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* RESOURCES HEADLINE SECTION */}
                      <div className="surface-box rounded-[28px] p-5 border border-[var(--border-card)] space-y-4">
                        <div className="flex items-center justify-between border-b border-[var(--border-soft)] pb-3">
                          <div>
                            <span className="text-[10px] font-mono uppercase font-bold text-[#F1CA7E] bg-[#701020] px-2 py-0.5 rounded inline-block mb-0.5">
                              Resources Headline
                            </span>
                            <h4
                              className="font-display text-lg font-bold"
                              style={{ color: "var(--text-main)" }}
                            >
                              Resources You Received (
                              {teamOwnedResources.length})
                            </h4>
                          </div>
                          <span className="px-3 py-1 rounded-full text-xs font-mono font-bold capsule-inset text-[#C0392B]">
                            Deducted: -Rs {currentTeam.resourceSpent || 0}L
                          </span>
                        </div>

                        {teamOwnedResources.length === 0 ? (
                          <div className="p-6 rounded-2xl capsule-inset text-center">
                            <p
                              className="text-xs font-rounded font-bold"
                              style={{ color: "var(--text-sub)" }}
                            >
                              No resources received yet. Resources won in the
                              Admin Bid appear here with the exact bid money
                              deducted.
                            </p>
                          </div>
                        ) : (
                          <div className="space-y-2.5 max-h-[380px] overflow-y-auto modal-scrollbar pr-1">
                            {teamOwnedResources.map((res) => (
                              <div
                                key={res.instanceId}
                                className="p-4 rounded-2xl capsule-card border border-[var(--border-soft)] flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                              >
                                <div className="flex items-start gap-3">
                                  <div
                                    className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 border transition-colors shadow-sm"
                                    style={{
                                      backgroundColor:
                                        "var(--resource-icon-bg)",
                                      borderColor:
                                        "var(--resource-badge-border)",
                                    }}
                                  >
                                    <UtilityIcon
                                      id={res.utilityId}
                                      className="w-4 h-4"
                                      style={{
                                        color: "var(--resource-icon-color)",
                                      }}
                                    />
                                  </div>
                                  <div className="space-y-0.5">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span
                                        className="text-[10px] font-mono font-bold uppercase"
                                        style={{ color: "var(--text-sub)" }}
                                      >
                                        Resource #{res.utilityId} ·{" "}
                                        {res.category}
                                      </span>
                                      <span
                                        className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold border transition-colors"
                                        style={
                                          res.attachedToPropertyName
                                            ? {
                                                backgroundColor:
                                                  "rgba(46, 125, 82, 0.15)",
                                                color: "#2E7D52",
                                                borderColor:
                                                  "rgba(46, 125, 82, 0.3)",
                                              }
                                            : {
                                                backgroundColor:
                                                  "var(--resource-badge-bg)",
                                                color:
                                                  "var(--resource-badge-text)",
                                                borderColor:
                                                  "var(--resource-badge-border)",
                                              }
                                        }
                                      >
                                        {res.attachedToPropertyName
                                          ? `Attached to ${res.attachedToPropertyName}`
                                          : "In Inventory (Ready to Attach)"}
                                      </span>
                                    </div>
                                    <h5
                                      className="font-display text-base font-bold"
                                      style={{ color: "var(--text-main)" }}
                                    >
                                      You received {res.name}
                                    </h5>
                                    <p
                                      className="text-xs font-rounded"
                                      style={{ color: "var(--text-sub)" }}
                                    >
                                      Boosts property level by +1 Level (up to
                                      Max Level 3)
                                    </p>
                                  </div>
                                </div>

                                <div className="text-left sm:text-right shrink-0 font-mono">
                                  <span className="text-xs font-bold text-[#C0392B] block">
                                    -Rs {res.bidPrice}L Deducted
                                  </span>
                                  <span className="text-[11px] text-[#2E7D52] font-bold block">
                                    +1 Property Level
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* 3. FULL DETAILED TRANSACTION FEED (ALL TEAMS & YOUR TEAM) */}
                    <div className="surface-box rounded-[28px] p-5 sm:p-6 border border-[var(--border-card)] space-y-4">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[var(--border-soft)] pb-3">
                        <div>
                          <span
                            className="text-xs font-mono uppercase font-bold block"
                            style={{ color: "var(--text-sub)" }}
                          >
                            Complete Tournament Activity Log ({allTxs.length}{" "}
                            Events)
                          </span>
                          <h4
                            className="font-display text-lg sm:text-xl font-bold"
                            style={{ color: "var(--text-main)" }}
                          >
                            Detailed History — Properties, Resources, Rent &
                            Cash Deductions
                          </h4>
                        </div>
                        <div className="flex items-center gap-2 text-xs font-mono">
                          <span className="px-2.5 py-1 rounded-full capsule-inset">
                            Properties: {propTransactions.length}
                          </span>
                          <span className="px-2.5 py-1 rounded-full capsule-inset">
                            Resources: {resourceTransactions.length}
                          </span>
                        </div>
                      </div>

                      {allTxs.length === 0 ? (
                        <div className="p-10 rounded-2xl text-center capsule-inset">
                          <p
                            className="text-sm font-rounded font-bold"
                            style={{ color: "var(--text-sub)" }}
                          >
                            No transactions recorded yet.
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-3 max-h-[540px] overflow-y-auto modal-scrollbar pr-1">
                          {allTxs.map((tx) => {
                            const isMyTeam =
                              String(tx.teamId) === String(currentTeam.id) ||
                              String(tx.targetTeamId) ===
                                String(currentTeam.id) ||
                              (tx.teamName &&
                                tx.teamName.toLowerCase() ===
                                  currentTeam.name.toLowerCase());

                            const isPropertyTx =
                              tx.type === "AUCTION_WIN" ||
                              tx.type === "SALE_REVOKED" ||
                              tx.category === "PROPERTY";
                            const isResourceTx =
                              tx.type === "RESOURCE_BID_WIN" ||
                              tx.type === "RESOURCE_REVOKED" ||
                              tx.type === "RESOURCE_LEVEL_UP" ||
                              tx.category === "RESOURCE";
                            const isRentTx = tx.type === "WHEEL_RENT";
                            const isRefund =
                              tx.type === "SALE_REVOKED" ||
                              tx.type === "RESOURCE_REVOKED";

                            let badgeLabel = "SYSTEM";
                            let badgeStyle = {
                              backgroundColor: "var(--bg-inset)",
                              color: "var(--text-main)",
                              borderColor: "var(--border-soft)",
                            };
                            if (isPropertyTx) {
                              badgeLabel = "PROPERTY";
                              badgeStyle = {
                                backgroundColor: "#2E7D52",
                                color: "#FFFFFF",
                                borderColor: "#2E7D52",
                              };
                            } else if (isResourceTx) {
                              badgeLabel = "RESOURCE";
                              badgeStyle = {
                                backgroundColor: "var(--resource-badge-bg)",
                                color: "var(--resource-badge-text)",
                                borderColor: "var(--resource-badge-border)",
                              };
                            } else if (isRentTx) {
                              badgeLabel = "WHEEL RENT";
                              badgeStyle = {
                                backgroundColor: "#B42318",
                                color: "#FFFFFF",
                                borderColor: "#B42318",
                              };
                            } else if (tx.type === "ADMIN_CASH_ADJUST") {
                              badgeLabel = "CASH ADJUST";
                              badgeStyle = {
                                backgroundColor: "var(--tab-active-bg)",
                                color: "var(--tab-active-text)",
                                borderColor: "var(--border-card)",
                              };
                            }

                            return (
                              <div
                                key={tx.id}
                                className={`p-4 rounded-2xl capsule-card border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                                  isMyTeam
                                    ? "border-2 border-[var(--border-active)]"
                                    : "border-[var(--border-soft)]"
                                }`}
                              >
                                <div className="space-y-1.5 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span
                                      className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold border transition-colors inline-flex items-center gap-1"
                                      style={badgeStyle}
                                    >
                                      {isResourceTx && (
                                        <span
                                          className="w-1.5 h-1.5 rounded-full inline-block"
                                          style={{
                                            backgroundColor:
                                              "var(--resource-icon-color)",
                                          }}
                                        />
                                      )}
                                      {badgeLabel}
                                    </span>
                                    {isMyTeam && (
                                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[#2E7D52]/20 text-[#2E7D52] border border-[#2E7D52]/30">
                                        YOUR TEAM
                                      </span>
                                    )}
                                    {tx.teamName && (
                                      <span
                                        className="text-xs font-mono font-bold"
                                        style={{ color: "var(--text-sub)" }}
                                      >
                                        Team: {tx.teamName}
                                      </span>
                                    )}
                                    {tx.createdAt && (
                                      <span
                                        className="text-[11px] font-mono opacity-75"
                                        style={{ color: "var(--text-sub)" }}
                                      >
                                        ·{" "}
                                        {new Date(
                                          tx.createdAt,
                                        ).toLocaleTimeString()}
                                      </span>
                                    )}
                                  </div>

                                  <p
                                    className="text-sm sm:text-base font-rounded font-bold"
                                    style={{ color: "var(--text-main)" }}
                                  >
                                    {tx.note}
                                  </p>

                                  {/* Itemized Pills if multiple Properties or Resources were given */}
                                  {Array.isArray(tx.items) &&
                                    tx.items.length > 0 && (
                                      <div className="flex items-center gap-1.5 flex-wrap pt-1">
                                        {tx.items.map((item, idx) => (
                                          <span
                                            key={`${tx.id}_item_${idx}`}
                                            className="px-2.5 py-0.5 rounded-lg capsule-inset text-[11px] font-mono font-semibold border"
                                            style={{
                                              color: "var(--text-main)",
                                              borderColor: "var(--border-soft)",
                                            }}
                                          >
                                            {item.name} (-Rs {item.price}L)
                                          </span>
                                        ))}
                                      </div>
                                    )}
                                </div>

                                {Number(tx.amount) > 0 && (
                                  <div className="text-left sm:text-right shrink-0 font-mono">
                                    <span
                                      className={`text-sm sm:text-base font-bold block ${
                                        isRefund
                                          ? "text-[#2E7D52]"
                                          : "text-[#C0392B]"
                                      }`}
                                    >
                                      {isRefund
                                        ? `+Rs ${tx.amount}L Refunded`
                                        : `-Rs ${tx.amount}L Deducted`}
                                    </span>
                                    {tx.cashAfter !== undefined && (
                                      <span
                                        className="text-[11px] block"
                                        style={{ color: "var(--text-sub)" }}
                                      >
                                        Balance After: Rs {tx.cashAfter}L
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

            {/* ================================================================= */}
            {/* TAB: RANKINGS (INVESTOMANIA 3D PODIUM & STANDINGS LEDGER)        */}
            {/* ================================================================= */}
            {activeTab === "standings" && (
              <MonopolyPodiumLeaderboard
                teams={allTeamSummaries}
                currentTeamId={currentTeam.id}
                round={store.currentRound}
              />
            )}

            {/* ================================================================= */}
            {/* TAB 5: RULES & OFFICIAL TOURNAMENT GUIDE                          */}
            {/* ================================================================= */}
            {activeTab === "guide" && (
              <div className="space-y-6">
                {/* Rules Header Hero */}
                <div className="surface-box rounded-[28px] p-6 sm:p-7 border border-[var(--border-card)] space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--border-soft)] pb-4">
                    <div>
                      <span className="text-[10px] font-mono uppercase font-bold text-[#F1CA7E] bg-[#701020] px-2.5 py-0.5 rounded inline-block mb-1">
                        Market Monopoly Official Rulebook
                      </span>
                      <h3
                        className="font-display text-2xl font-bold"
                        style={{ color: "var(--text-main)" }}
                      >
                        Tournament Guidelines & Strategic Playbook
                      </h3>
                      <p
                        className="text-xs font-rounded mt-1"
                        style={{ color: "var(--text-sub)" }}
                      >
                        Complete guide to Karachi property acquisitions, the
                        17-resource level-up engine, rent arithmetic, and
                        victory conditions.
                      </p>
                    </div>
                    <div className="flex items-center gap-2 font-mono text-xs shrink-0">
                      <span className="px-3 py-1 rounded-full capsule-inset font-bold">
                        Starting: Rs 500L
                      </span>
                      <span className="px-3 py-1 rounded-full text-[#F1CA7E] bg-[#701020] font-bold">
                        2 Rounds
                      </span>
                    </div>
                  </div>

                  {/* 4 Quick Executive Summaries */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-1">
                    <div className="p-3 rounded-2xl capsule-inset space-y-1">
                      <span className="text-[10px] font-mono uppercase font-bold text-[#2E7D52] block">
                        Rule 01
                      </span>
                      <div
                        className="text-xs font-bold"
                        style={{ color: "var(--text-main)" }}
                      >
                        Starting Capital
                      </div>
                      <p
                        className="text-[11px] font-rounded"
                        style={{ color: "var(--text-sub)" }}
                      >
                        Rs 500 Lakh allocated to every team. Budget wisely
                        across properties and resources.
                      </p>
                    </div>

                    <div className="p-3 rounded-2xl capsule-inset space-y-1">
                      <span className="text-[10px] font-mono uppercase font-bold text-[#8D5B3A] block">
                        Rule 02
                      </span>
                      <div
                        className="text-xs font-bold"
                        style={{ color: "var(--text-main)" }}
                      >
                        No Cash Upgrades
                      </div>
                      <p
                        className="text-[11px] font-rounded"
                        style={{ color: "var(--text-sub)" }}
                      >
                        Properties CANNOT level up with money. Level ups require
                        winning Bid Resources from the Admin.
                      </p>
                    </div>

                    <div className="p-3 rounded-2xl capsule-inset space-y-1">
                      <span className="text-[10px] font-mono uppercase font-bold text-[#701020] block">
                        Rule 03
                      </span>
                      <div
                        className="text-xs font-bold"
                        style={{ color: "var(--text-main)" }}
                      >
                        Level Cap (Max 3)
                      </div>
                      <p
                        className="text-[11px] font-rounded"
                        style={{ color: "var(--text-sub)" }}
                      >
                        Each property accepts up to 3 distinct resources. Each
                        resource grants +1 Level and boosts rent.
                      </p>
                    </div>

                    <div className="p-3 rounded-2xl capsule-inset space-y-1">
                      <span className="text-[10px] font-mono uppercase font-bold text-[#D97706] block">
                        Rule 04
                      </span>
                      <div
                        className="text-xs font-bold"
                        style={{ color: "var(--text-main)" }}
                      >
                        Spin-Wheel Rent
                      </div>
                      <p
                        className="text-[11px] font-rounded"
                        style={{ color: "var(--text-sub)" }}
                      >
                        In Round 2, spinning the wheel lands on a property. The
                        spinner pays calculated rent to the owner.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Deep Dive: Round 1 & Round 2 Breakdown */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  {/* Round 1 Card */}
                  <div className="surface-box rounded-[28px] p-6 border border-[var(--border-card)] space-y-4">
                    <div className="flex items-center justify-between border-b border-[var(--border-soft)] pb-3">
                      <div>
                        <span className="text-[10px] font-mono uppercase font-bold px-2 py-0.5 rounded bg-[#2E7D52]/15 text-[#2E7D52] inline-block mb-1">
                          Phase One
                        </span>
                        <h4
                          className="font-display text-lg font-bold"
                          style={{ color: "var(--text-main)" }}
                        >
                          Round 1: Karachi Property Auction
                        </h4>
                      </div>
                      <span className="font-mono text-xs font-bold px-2.5 py-1 rounded-full capsule-inset">
                        25 Land Plots
                      </span>
                    </div>

                    <div
                      className="space-y-3 text-xs font-rounded leading-relaxed"
                      style={{ color: "var(--text-sub)" }}
                    >
                      <p>
                        <strong className="text-[var(--text-main)] block font-semibold mb-0.5">
                          1. Live Floor Auction
                        </strong>
                        The Admin presents 25 prime Karachi properties across
                        Residential, Commercial, and Industrial zones (DHA,
                        Clifton, Korangi, Gulshan, Port Qasim).
                      </p>
                      <p>
                        <strong className="text-[var(--text-main)] block font-semibold mb-0.5">
                          2. Bidding & Deductions
                        </strong>
                        Teams bid their cash balance. When the hammer falls, the
                        Admin assigns the property, and the winning bid is
                        immediately deducted from the team's available cash.
                      </p>
                      <p>
                        <strong className="text-[var(--text-main)] block font-semibold mb-0.5">
                          3. Land Ownership & Portfolio
                        </strong>
                        Owned plots appear immediately on your{" "}
                        <strong>My Land</strong> board as 3D isometric
                        properties with Base Level 0 (Vacant Land) and standard
                        starting rent.
                      </p>
                    </div>

                    <div className="p-3.5 rounded-2xl capsule-inset space-y-1.5 font-mono text-[11px]">
                      <div className="flex items-center justify-between text-[#2E7D52] font-bold">
                        <span>Property Value Formula:</span>
                        <span>Base Price + (Level × Value Boost)</span>
                      </div>
                      <p className="text-[10px] opacity-75">
                        High tier assets like Port Qasim and Clifton Marine
                        Drive yield the highest baseline valuations.
                      </p>
                    </div>
                  </div>

                  {/* Round 2 Card */}
                  <div className="surface-box rounded-[28px] p-6 border border-[var(--border-card)] space-y-4">
                    <div className="flex items-center justify-between border-b border-[var(--border-soft)] pb-3">
                      <div>
                        <span className="text-[10px] font-mono uppercase font-bold px-2 py-0.5 rounded bg-[#701020] text-[#F1CA7E] inline-block mb-1">
                          Phase Two
                        </span>
                        <h4
                          className="font-display text-lg font-bold"
                          style={{ color: "var(--text-main)" }}
                        >
                          Round 2: Bid Resources & The Rent Wheel
                        </h4>
                      </div>
                      <span className="font-mono text-xs font-bold px-2.5 py-1 rounded-full text-[#F1CA7E] bg-[#701020]">
                        17 Resources
                      </span>
                    </div>

                    <div
                      className="space-y-3 text-xs font-rounded leading-relaxed"
                      style={{ color: "var(--text-sub)" }}
                    >
                      <p>
                        <strong className="text-[var(--text-main)] block font-semibold mb-0.5">
                          1. Admin Resource Bids
                        </strong>
                        Admin conducts competitive bids for the 17 vital
                        municipal resources (Electricity, Gas, Solar, CCTV,
                        Warehousing). Winning bids deduct cash from the team's
                        balance.
                      </p>
                      <p>
                        <strong className="text-[var(--text-main)] block font-semibold mb-0.5">
                          2. Drag & Drop Level Ups
                        </strong>
                        Unassigned resources sit in your inventory. Drag them
                        onto any owned property to level it up (+1 Level).
                        Upgrading from Level 0 to Level 3 transforms the 3D
                        visual from a vacant lot into a cottage, villa, and
                        high-rise landmark tower with an upgrade orb curb.
                      </p>
                      <p>
                        <strong className="text-[var(--text-main)] block font-semibold mb-0.5">
                          3. Wheel Spin & Rent Payment
                        </strong>
                        When Admin triggers a wheel spin wave, teams spin the
                        25-sector Karachi Wheel. Landing on another team's
                        property pays the calculated rent directly to them.
                        Landing on your own property costs nothing!
                      </p>
                    </div>

                    <div className="p-3.5 rounded-2xl capsule-inset space-y-1.5 font-mono text-[11px]">
                      <div className="flex items-center justify-between text-[#C0392B] font-bold">
                        <span>Rent Due Formula:</span>
                        <span>Base Rent + (Level × Rent Increment)</span>
                      </div>
                      <p className="text-[10px] opacity-75">
                        A Level 3 property commands 3× to 5× higher rent than a
                        vacant Level 0 lot.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Level Up Progression Guide */}
                <div className="surface-box rounded-[28px] p-6 border border-[var(--border-card)] space-y-4">
                  <div className="border-b border-[var(--border-soft)] pb-3">
                    <span className="text-[10px] font-mono uppercase font-bold text-[#8D5B3A] block">
                      Architectural Hierarchy
                    </span>
                    <h4
                      className="font-display text-lg font-bold"
                      style={{ color: "var(--text-main)" }}
                    >
                      Visual & Financial Property Level Progression
                    </h4>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                    {/* Level 0 */}
                    <div className="p-4 rounded-2xl capsule-card border border-[var(--border-soft)] space-y-2">
                      <div className="flex items-center justify-between">
                        <span
                          className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-black/10"
                          style={{ color: "var(--text-main)" }}
                        >
                          LEVEL 0
                        </span>
                        <span className="text-[10px] font-mono text-[#71717A]">
                          0 Resources
                        </span>
                      </div>
                      <h5
                        className="font-bold text-sm"
                        style={{ color: "var(--text-main)" }}
                      >
                        Vacant Plot
                      </h5>
                      <p
                        className="text-xs font-rounded"
                        style={{ color: "var(--text-sub)" }}
                      >
                        Raw surveyed land plot with dashed curbs. Produces
                        standard base rent and initial valuation.
                      </p>
                    </div>

                    {/* Level 1 */}
                    <div className="p-4 rounded-2xl capsule-card border border-[var(--border-soft)] space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-[#8D5B3A] text-white">
                          LEVEL 1
                        </span>
                        <span className="text-[10px] font-mono text-[#2E7D52] font-bold">
                          1 Resource
                        </span>
                      </div>
                      <h5
                        className="font-bold text-sm"
                        style={{ color: "var(--text-main)" }}
                      >
                        Cottage Development
                      </h5>
                      <p
                        className="text-xs font-rounded"
                        style={{ color: "var(--text-sub)" }}
                      >
                        Adds small 3D residential / commercial building.
                        Activates 1st golden sphere on the curb. +1 Rent boost.
                      </p>
                    </div>

                    {/* Level 2 */}
                    <div className="p-4 rounded-2xl capsule-card border border-[var(--border-soft)] space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-[#701020] text-[#F1CA7E]">
                          LEVEL 2
                        </span>
                        <span className="text-[10px] font-mono text-[#2E7D52] font-bold">
                          2 Resources
                        </span>
                      </div>
                      <h5
                        className="font-bold text-sm"
                        style={{ color: "var(--text-main)" }}
                      >
                        3-Story Urban Plaza
                      </h5>
                      <p
                        className="text-xs font-rounded"
                        style={{ color: "var(--text-sub)" }}
                      >
                        Adds central 3-story mansion/office complex with
                        illuminated windows. 2nd golden sphere lights up.
                      </p>
                    </div>

                    {/* Level 3 */}
                    <div className="p-4 rounded-2xl capsule-card border border-[var(--border-soft)] space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-[#F1CA7E] text-[#1B0308]">
                          LEVEL 3 (MAX)
                        </span>
                        <span className="text-[10px] font-mono text-[#2E7D52] font-bold">
                          3 Resources
                        </span>
                      </div>
                      <h5
                        className="font-bold text-sm"
                        style={{ color: "var(--text-main)" }}
                      >
                        Landmark High-Rise
                      </h5>
                      <p
                        className="text-xs font-rounded"
                        style={{ color: "var(--text-sub)" }}
                      >
                        Crowned with a landmark spire, golden beacon, and all 3
                        upgrade spheres. Maximum rent potential!
                      </p>
                    </div>
                  </div>
                </div>

                {/* Victory Conditions */}
                <div className="surface-box rounded-[28px] p-6 border border-[var(--border-card)] space-y-3">
                  <div className="border-b border-[var(--border-soft)] pb-3">
                    <span className="text-[10px] font-mono uppercase font-bold text-[#2E7D52] block">
                      Tournament Victory Conditions
                    </span>
                    <h4
                      className="font-display text-lg font-bold"
                      style={{ color: "var(--text-main)" }}
                    >
                      How Net Worth & Rankings Are Decided
                    </h4>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-rounded">
                    <div className="p-4 rounded-2xl capsule-inset space-y-1.5">
                      <strong
                        className="block font-bold text-sm"
                        style={{ color: "var(--text-main)" }}
                      >
                        Net Worth Equation
                      </strong>
                      <p className="font-mono text-[11px] text-[#2E7D52] font-bold">
                        Net Worth = Liquid Cash + Total Property Valuations +
                        Unassigned Resources
                      </p>
                      <p style={{ color: "var(--text-sub)" }}>
                        Both raw cash and upgraded real estate count toward your
                        leaderboard standing.
                      </p>
                    </div>

                    <div className="p-4 rounded-2xl capsule-inset space-y-1.5">
                      <strong
                        className="block font-bold text-sm"
                        style={{ color: "var(--text-main)" }}
                      >
                        Rental Cash Flow
                      </strong>
                      <p style={{ color: "var(--text-sub)" }}>
                        Teams with upgraded properties steadily siphon cash away
                        from other contestants during the spin wheel phases.
                      </p>
                    </div>

                    <div className="p-4 rounded-2xl capsule-inset space-y-1.5">
                      <strong
                        className="block font-bold text-sm"
                        style={{ color: "var(--text-main)" }}
                      >
                        Final Podium Ceremony
                      </strong>
                      <p style={{ color: "var(--text-sub)" }}>
                        When the tournament concludes, the 3D Podium ranks the
                        Top 3 Tycoons with gold, silver, and bronze trophies.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ================================================================= */}
            {/* TAB: INFO (PROPERTIES CATALOGUE + 17 BID RESOURCES DIRECTORY)    */}
            {/* ================================================================= */}
            {activeTab === "catalogue" && (
              <div className="space-y-6">
                {/* 1. 25 KARACHI PROPERTIES DIRECTORY */}
                <div className="surface-box rounded-[28px] p-5 border border-[var(--border-card)] space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--border-soft)] pb-3">
                    <div>
                      <span className="text-[10px] font-mono uppercase font-bold text-[#2E7D52] block">
                        Asset Class 1 · Real Estate
                      </span>
                      <h3
                        className="font-display text-xl font-bold"
                        style={{ color: "var(--text-main)" }}
                      >
                        25 Karachi Properties Directory
                      </h3>
                    </div>
                    <span className="px-3 py-1 rounded-full text-xs font-mono font-bold capsule-inset">
                      Total: 25 Land Plots
                    </span>
                  </div>

                  <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
                    <div className="relative flex-1 max-w-sm">
                      <IconSearch className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 opacity-60" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search properties..."
                        className="w-full capsule-card rounded-full pl-10 pr-4 py-2 text-xs font-rounded font-semibold focus:outline-none"
                        style={{ color: "var(--text-main)" }}
                      />
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap">
                      {["ALL", "Residential", "Commercial", "Industrial"].map(
                        (cat) => (
                          <TactileButton
                            key={cat}
                            onClick={() => setCategoryFilter(cat)}
                            className={`px-3.5 py-1.5 rounded-full text-xs font-rounded font-bold transition-colors ${
                              categoryFilter === cat
                                ? "btn-primary"
                                : "capsule-card"
                            }`}
                            style={
                              categoryFilter !== cat
                                ? { color: "var(--text-main)" }
                                : undefined
                            }
                          >
                            {cat === "ALL" ? "All (25)" : cat}
                          </TactileButton>
                        ),
                      )}
                    </div>
                  </div>

                  {/* BIG 25-PLOT KARACHI LAND GRID BOARD */}
                  <div
                    className="rounded-[24px] p-4 sm:p-5 border-2 relative overflow-hidden capsule-inset"
                    style={{
                      borderColor: "var(--border-card)",
                      backgroundColor: "var(--bg-inset)",
                    }}
                  >
                    {/* Subtle Architectural Survey Grid Lines Overlay (Theme-Adaptive) */}
                    <div
                      className="absolute inset-0 pointer-events-none opacity-60"
                      style={{
                        backgroundImage:
                          "linear-gradient(to right, var(--chart-grid) 1px, transparent 1px), linear-gradient(to bottom, var(--chart-grid) 1px, transparent 1px)",
                        backgroundSize: "44px 44px",
                      }}
                    />

                    <div className="relative z-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5">
                      {filteredCatalogue.map((prop) => {
                        const owner = store.teams.find(
                          (t) => t.id === prop.ownerTeamId,
                        );
                        const attachedIds = Array.isArray(
                          prop.attachedUtilities,
                        )
                          ? prop.attachedUtilities
                          : [];
                        const plotLvl = owner
                          ? Math.min(
                              3,
                              Math.max(
                                Number(prop.upgradeLevel || 0),
                                attachedIds.length,
                              ),
                            )
                          : 0;
                        const initialRent = Array.isArray(prop.rentValues)
                          ? prop.rentValues[0]
                          : 15;
                        const hasAuctionPrice = Number(prop.purchasePrice) > 0;

                        return (
                          <div
                            key={prop.id}
                            onClick={() => setInspectedPropertyId(prop.id)}
                            className="group relative rounded-2xl p-3.5 transition-all cursor-pointer select-none border-2 capsule-card hover:scale-[1.01] hover:shadow-lg flex flex-col gap-2.5"
                            style={{
                              backgroundColor: "var(--bg-card)",
                              borderColor: "var(--border-card)",
                            }}
                          >
                            {/* 3D Isometric Plot Tile */}
                            <div className="relative rounded-xl overflow-hidden">
                              <LandPlotIllustration
                                category={prop.category}
                                level={plotLvl}
                                utilityCount={attachedIds.length}
                                showBadge={false}
                              />
                              <div className="absolute top-2 left-2 right-2 flex items-center justify-between gap-1.5">
                                <span className="text-[10px] font-rounded font-bold px-2 py-0.5 rounded-md bg-black/80 text-[#F8EEE1] border border-[#F1CA7E]/40">
                                  #{prop.id} · {prop.category}
                                </span>
                                {owner ? (
                                  <span className="text-[10px] font-rounded font-bold px-2 py-0.5 rounded-md bg-[#2E7D52] text-white shadow-sm truncate max-w-[110px]">
                                    {owner.name} (L{plotLvl})
                                  </span>
                                ) : (
                                  <span className="text-[10px] font-rounded font-bold px-2 py-0.5 rounded-md bg-[#701020] text-[#F1CA7E] border border-[#F1CA7E]/40 shadow-sm">
                                    For Sale
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Plot Name Header */}
                            <div className="px-0.5 flex items-center justify-between gap-2">
                              <h4
                                className="font-display text-sm font-bold truncate"
                                style={{ color: "var(--text-main)" }}
                              >
                                {prop.name}
                              </h4>
                              <span className="text-[10px] font-rounded font-bold px-2 py-0.5 rounded-md capsule-inset text-[#2E7D52] shrink-0">
                                Level {plotLvl}/3
                              </span>
                            </div>

                            {/* Core Financial Metrics Grid */}
                            <div className="grid grid-cols-2 gap-1.5 p-2 rounded-xl capsule-inset text-[10.5px] font-mono">
                              <div>
                                <span
                                  className="text-[9px] font-rounded block opacity-75"
                                  style={{ color: "var(--text-sub)" }}
                                >
                                  Base Price
                                </span>
                                <strong style={{ color: "var(--text-main)" }}>
                                  Rs {prop.openingValue}L
                                </strong>
                              </div>
                              <div>
                                <span
                                  className="text-[9px] font-rounded block opacity-75"
                                  style={{ color: "var(--text-sub)" }}
                                >
                                  Initial Rent
                                </span>
                                <strong style={{ color: "var(--text-main)" }}>
                                  Rs {initialRent}L
                                </strong>
                              </div>
                              <div>
                                <span
                                  className="text-[9px] font-rounded block opacity-75"
                                  style={{ color: "var(--text-sub)" }}
                                >
                                  Auctioned Price
                                </span>
                                <strong
                                  className={
                                    hasAuctionPrice
                                      ? "text-[#2E7D52]"
                                      : "text-red dark:text-amber-400-blue"
                                  }
                                >
                                  {hasAuctionPrice
                                    ? `Rs ${prop.purchasePrice}L`
                                    : "For Sale"}
                                </strong>
                              </div>
                              <div>
                                <span
                                  className="text-[9px] font-rounded block opacity-75"
                                  style={{ color: "var(--text-sub)" }}
                                >
                                  Owner
                                </span>
                                <strong
                                  className="truncate block"
                                  style={{
                                    color: owner
                                      ? "#2E7D52"
                                      : "var(--text-sub)",
                                  }}
                                >
                                  {owner ? owner.name : "TBD"}
                                </strong>
                              </div>
                            </div>

                            {/* View Property Action Button */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setInspectedPropertyId(prop.id);
                              }}
                              className="w-full py-1.5 px-3 rounded-xl text-xs font-rounded font-bold bg-[#701020] text-[#F1CA7E] hover:opacity-90 active:scale-[0.99] transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
                            >
                              <span>View Property</span>
                              <span>→</span>
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* FLOATING RIGHT SIDEBAR BUTTON FOR CENTER-SCREEN PROPERTY SPIN WHEEL */}
      <div className="fixed right-3 sm:right-5 top-1/2 -translate-y-1/2 z-40 pointer-events-auto">
        <motion.button
          onClick={() => setIsWheelModalOpen(true)}
          whileHover={{ scale: 1.06 }}
          whileTap={{ scale: 0.96 }}
          transition={{ duration: 0.15, ease: "easeOut" }}
          className="group relative flex items-center justify-center w-13 h-13 sm:w-14 sm:h-14 rounded-full shadow-2xl border-2 border-[#F1CA7E] bg-[#b81434] hover:bg-[#cf1a3d] text-[#FFFFFF] cursor-pointer transition-colors"
          aria-label="Open Property Rent Wheel"
        >
          <IconRadar className="w-6 h-6 text-[#F1CA7E]" />

          <span
            className={`absolute -top-1.5 -right-1.5 px-1.5 py-0.5 rounded-full border border-[#F1CA7E] text-[9px] font-mono font-bold text-white shadow-md ${
              !store.wheelSpinsByRound?.[store.currentWheelRound || 1]?.[
                currentTeam.id
              ]
                ? "bg-[#2E7D52]"
                : "bg-[#701020]"
            }`}
          >
            #{store.currentWheelRound || 1}
          </span>

          <span className="pointer-events-none absolute right-full mr-3 whitespace-nowrap rounded-xl bg-[#1E1E1E] border border-[#3d000e] px-3 py-1.5 text-xs font-rounded font-bold text-[#FFFFFF] shadow-xl opacity-0 group-hover:opacity-100 transition-opacity duration-150">
            Spin Wheel #{store.currentWheelRound || 1}
          </span>
        </motion.button>
      </div>

      {/* CENTER-SCREEN LARGE 25-PROPERTY SPIN WHEEL MODAL */}
      <SpinWheelModal
        isOpen={isWheelModalOpen}
        onClose={() => setIsWheelModalOpen(false)}
        store={store}
        currentTeam={currentTeam}
        onCompleteSpin={handleTeamSpinWheel}
      />

      {/* SIGN OUT MODAL */}
      <AnimatePresence>
        {isSignOutModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={() => setIsSignOutModalOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 12 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              transition={{ duration: 0.16, ease: "easeOut" }}
              onClick={(e) => e.stopPropagation()}
              className="surface-box rounded-[28px] p-6 max-w-sm w-full space-y-4 border border-[var(--border-card)] shadow-2xl text-center"
            >
              <h3
                className="font-display text-xl font-bold"
                style={{ color: "var(--text-main)" }}
              >
                Sign Out?
              </h3>
              <div className="flex items-center gap-3 pt-2">
                <TactileButton
                  type="button"
                  onClick={() => setIsSignOutModalOpen(false)}
                  className="flex-1 rounded-full py-2.5 capsule-card text-xs font-rounded font-bold border border-[var(--border-soft)]"
                >
                  Cancel
                </TactileButton>
                <TactileButton
                  type="button"
                  onClick={handleSignOut}
                  style={{
                    backgroundColor: "var(--btn-signout-bg)",
                    color: "var(--btn-signout-text)",
                    borderColor: "var(--btn-signout-border)",
                  }}
                  className="flex-1 rounded-full py-2.5 text-xs font-rounded font-bold border cursor-pointer"
                >
                  Sign Out
                </TactileButton>
              </div>
            </motion.div>
          </motion.div>
        )}

        {/* MOBILE NAVIGATION MODAL */}
        {isMobileNavOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-sm"
            onClick={() => setIsMobileNavOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              className="surface-box w-full max-w-sm overflow-hidden flex flex-col shadow-2xl rounded-[28px] border border-[var(--border-card)]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-4 border-b border-[var(--border-soft)] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <IconLayers className="w-4 h-4" />
                  <h3
                    className="font-display font-bold text-base"
                    style={{ color: "var(--text-main)" }}
                  >
                    Menu
                  </h3>
                </div>
                <TactileButton
                  onClick={() => setIsMobileNavOpen(false)}
                  className="w-8 h-8 rounded-full flex items-center justify-center border border-[var(--border-soft)] cursor-pointer"
                >
                  <IconClose className="w-4 h-4" />
                </TactileButton>
              </div>

              <div className="p-4 space-y-2">
                {sidebarItems.map((item) => {
                  const active = activeTab === item.id;
                  return (
                    <TactileButton
                      key={item.id}
                      onClick={() => {
                        setActiveTab(item.id);
                        setIsMobileNavOpen(false);
                      }}
                      className={`w-full rounded-2xl p-3 flex items-center justify-between text-xs font-rounded font-bold ${
                        active
                          ? "border-2 border-[var(--border-active)]"
                          : "border-2 border-transparent"
                      }`}
                      style={
                        active
                          ? {
                              backgroundColor: "var(--tab-active-bg)",
                              color: "var(--tab-active-text)",
                            }
                          : {
                              backgroundColor: "var(--bg-inset)",
                              color: "var(--text-main)",
                            }
                      }
                    >
                      <span>{item.label}</span>
                      <span className="font-mono">{item.badge}</span>
                    </TactileButton>
                  );
                })}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* RIGHT-CLICK CONTEXT MENU FOR LAND PLOTS */}
      <AnimatePresence>
        {contextMenu && contextProperty && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.14, ease: "easeOut" }}
            onClick={(e) => e.stopPropagation()}
            style={{ top: contextMenu.y, left: contextMenu.x }}
            className="fixed z-50 w-68 rounded-2xl surface-box border-2 border-[#701020] shadow-2xl p-3 space-y-2.5"
          >
            <div className="flex items-center justify-between border-b border-[var(--border-soft)] pb-2">
              <span
                className="font-display text-sm font-bold truncate"
                style={{ color: "var(--text-main)" }}
              >
                {contextProperty.name}
              </span>
              <button
                type="button"
                onClick={() => setContextMenu(null)}
                className="p-1 rounded-lg hover:bg-[var(--bg-inset)] cursor-pointer"
              >
                <IconClose className="w-3.5 h-3.5" />
              </button>
            </div>

            <div
              className="px-1 text-[11px] font-rounded font-bold"
              style={{ color: "var(--text-sub)" }}
            >
              Level {contextProperty.upgradeLevel || 0} / 3 Max · Attach a Bid
              Resource:
            </div>

            <div className="max-h-48 overflow-y-auto modal-scrollbar space-y-1 pr-1">
              {(currentTeam.ownedResources || []).filter(
                (r) => !r.attachedToPropertyId,
              ).length === 0 ? (
                <div
                  className="p-2.5 rounded-xl capsule-inset text-xs font-rounded text-center"
                  style={{ color: "var(--text-sub)" }}
                >
                  No unassigned Bid Resources in your inventory.
                </div>
              ) : (
                (currentTeam.ownedResources || [])
                  .filter((r) => !r.attachedToPropertyId)
                  .map((res) => {
                    const alreadyInstalled = (
                      contextProperty.attachedUtilities || []
                    ).includes(res.utilityId);
                    return (
                      <button
                        key={res.instanceId}
                        type="button"
                        disabled={
                          alreadyInstalled ||
                          (contextProperty.upgradeLevel || 0) >= 3
                        }
                        onClick={() => {
                          handleInstallUtility(
                            contextProperty.id,
                            res.utilityId,
                          );
                          setContextMenu(null);
                        }}
                        className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-rounded font-semibold flex items-center justify-between cursor-pointer ${
                          alreadyInstalled
                            ? "opacity-40 cursor-not-allowed"
                            : "hover:bg-[var(--bg-inset)]"
                        }`}
                        style={{ color: "var(--text-main)" }}
                      >
                        <span className="flex items-center gap-1.5 truncate">
                          <UtilityIcon
                            id={res.utilityId}
                            className="w-3.5 h-3.5 shrink-0"
                            style={{ color: "var(--resource-icon-color)" }}
                          />
                          <span className="truncate">{res.name}</span>
                        </span>
                        <span className="font-mono text-[11px] font-bold text-[#2E7D52] shrink-0">
                          {alreadyInstalled ? "Added" : "+1 Lvl"}
                        </span>
                      </button>
                    );
                  })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* PROPERTY DETAILS & RESOURCE UPGRADE MODAL */}
      <AnimatePresence>
        {inspectedProperty &&
          (() => {
            const attachedIds = Array.isArray(
              inspectedProperty.attachedUtilities,
            )
              ? inspectedProperty.attachedUtilities
              : [];
            const actualLevel = Math.min(
              3,
              Math.max(
                Number(inspectedProperty.upgradeLevel || 0),
                attachedIds.length,
              ),
            );
            const displayedLevel =
              previewLevelOverride !== null
                ? previewLevelOverride
                : actualLevel;
            const isOwnedByMe =
              currentTeam &&
              Number(inspectedProperty.ownerTeamId) === Number(currentTeam.id);
            const ownerTeam = store.teams.find(
              (t) => Number(t.id) === Number(inspectedProperty.ownerTeamId),
            );
            const currentVal = computePropertyValuation(inspectedProperty);
            const currentRent = computePropertyRent(inspectedProperty);
            const unassignedResources = (
              currentTeam?.ownedResources || []
            ).filter((r) => !r.attachedToPropertyId);

            return (
              <div
                onClick={() => {
                  setInspectedPropertyId(null);
                  setPreviewLevelOverride(null);
                }}
                className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-center justify-center p-4"
              >
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  transition={{ duration: 0.16, ease: "easeOut" }}
                  onClick={(e) => e.stopPropagation()}
                  className="surface-box rounded-[28px] max-w-lg w-full p-5 border border-[var(--border-card)] space-y-3.5 max-h-[90vh] overflow-y-auto modal-scrollbar"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-rounded font-bold px-2.5 py-0.5 rounded-full bg-[#701020] text-[#F1CA7E]">
                          #{inspectedProperty.id} · {inspectedProperty.category}
                        </span>
                        {ownerTeam ? (
                          <span className="text-[10px] font-rounded font-bold px-2.5 py-0.5 rounded-full bg-[#2E7D52] text-white">
                            Owner: {ownerTeam.name} (Level {actualLevel})
                          </span>
                        ) : (
                          <span className="text-[10px] font-rounded font-bold px-2.5 py-0.5 rounded-full bg-[#701020] text-[#F1CA7E] border border-[#F1CA7E]/40">
                            Owner: For Sale
                          </span>
                        )}
                      </div>
                      <h2
                        className="font-display text-lg font-bold mt-1"
                        style={{ color: "var(--text-main)" }}
                      >
                        {inspectedProperty.name}
                      </h2>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setInspectedPropertyId(null);
                        setPreviewLevelOverride(null);
                      }}
                      className="p-1.5 rounded-xl bg-[var(--bg-inset)] cursor-pointer"
                    >
                      <IconClose className="w-4 h-4" />
                    </button>
                  </div>

                  {/* 3D Isometric Plot Preview + Interactive Level 0/1/2/3 Version Switcher */}
                  <div className="space-y-2">
                    <div className="rounded-2xl overflow-hidden border border-[var(--border-soft)]">
                      <LandPlotIllustration
                        category={inspectedProperty.category}
                        level={displayedLevel}
                        utilityCount={attachedIds.length}
                        isHighlighted
                      />
                    </div>

                    {/* Level 0 / 1 / 2 / 3 Architectural Version Preview Selector */}
                    <div className="flex items-center justify-between gap-1.5 p-1.5 rounded-2xl capsule-inset">
                      <span
                        className="text-[10px] font-rounded font-bold px-2"
                        style={{ color: "var(--text-sub)" }}
                      >
                        Preview 3D Version:
                      </span>
                      <div className="flex items-center gap-1">
                        {[0, 1, 2, 3].map((lvlOpt) => {
                          const active = displayedLevel === lvlOpt;
                          const isCurrent =
                            actualLevel === lvlOpt &&
                            previewLevelOverride === null;
                          return (
                            <button
                              key={lvlOpt}
                              type="button"
                              onClick={() =>
                                setPreviewLevelOverride(
                                  lvlOpt === actualLevel ? null : lvlOpt,
                                )
                              }
                              className={`px-2.5 py-1 rounded-xl text-[10px] font-rounded font-bold transition-all cursor-pointer ${
                                active
                                  ? "bg-[#701020] text-[#F1CA7E] shadow-sm"
                                  : "hover:bg-black/10"
                              }`}
                              style={
                                !active
                                  ? { color: "var(--text-main)" }
                                  : undefined
                              }
                            >
                              {lvlOpt === 0 ? "Empty" : `Lvl ${lvlOpt}`}
                              {isCurrent ? " ★" : ""}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Valuation & Rent Metrics (L3 Target Removed) */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center p-2.5 rounded-2xl capsule-inset font-mono text-xs">
                    <div>
                      <span
                        className="text-[10px] font-rounded opacity-75 block"
                        style={{ color: "var(--text-sub)" }}
                      >
                        Base Price
                      </span>
                      <strong style={{ color: "var(--text-main)" }}>
                        Rs {inspectedProperty.openingValue}L
                      </strong>
                    </div>
                    <div>
                      <span
                        className="text-[10px] font-rounded opacity-75 block"
                        style={{ color: "var(--text-sub)" }}
                      >
                        Initial Rent
                      </span>
                      <strong style={{ color: "var(--text-main)" }}>
                        Rs {inspectedProperty.rentValues?.[0] || 15}L
                      </strong>
                    </div>
                    <div>
                      <span
                        className="text-[10px] font-rounded opacity-75 block"
                        style={{ color: "var(--text-sub)" }}
                      >
                        Auctioned Price
                      </span>
                      <strong
                        className={
                          Number(inspectedProperty.purchasePrice) > 0
                            ? "text-[#2E7D52]"
                            : "text-[#F1CA7E]"
                        }
                      >
                        {Number(inspectedProperty.purchasePrice) > 0
                          ? `Rs ${inspectedProperty.purchasePrice}L`
                          : "For Sale"}
                      </strong>
                    </div>
                    <div>
                      <span
                        className="text-[10px] font-rounded opacity-75 block"
                        style={{ color: "var(--text-sub)" }}
                      >
                        Owner
                      </span>
                      <strong
                        className="truncate block"
                        style={{
                          color: ownerTeam ? "#2E7D52" : "var(--text-sub)",
                        }}
                      >
                        {ownerTeam ? ownerTeam.name : "For Sale"}
                      </strong>
                    </div>
                  </div>

                  {/* Current Rent Yield & Valuation Banner */}
                  <div className="flex items-center justify-between px-3.5 py-2 rounded-xl capsule-card border border-[var(--border-soft)] text-xs font-mono">
                    <div className="flex items-center gap-2">
                      <span
                        className="text-[11px] font-rounded opacity-75"
                        style={{ color: "var(--text-sub)" }}
                      >
                        Current Rent Yield:
                      </span>
                      <strong className="text-[#2E7D52]">
                        Rs {currentRent}L
                      </strong>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className="text-[11px] font-rounded opacity-75"
                        style={{ color: "var(--text-sub)" }}
                      >
                        Total Valuation:
                      </span>
                      <strong className="text-[#2E7D52]">
                        Rs {currentVal}L
                      </strong>
                    </div>
                  </div>

                  {/* NUMBER OF LEVELS & WHAT HAPPENS IF LEVEL INCREASED */}
                  <div className="p-3.5 rounded-2xl capsule-card border border-[var(--border-soft)] space-y-3">
                    <div className="flex items-center justify-between text-xs font-rounded font-bold">
                      <div className="flex items-center gap-1.5">
                        <span style={{ color: "var(--text-main)" }}>
                          Property Levels
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#701020] text-[#F1CA7E]">
                          3 Levels Max
                        </span>
                      </div>
                      <span className="font-mono text-[#2E7D52]">
                        {actualLevel === 0
                          ? "Level 0 (Vacant Plot)"
                          : actualLevel >= 3
                            ? "Level 3 (Max Developed)"
                            : `Level ${actualLevel} / 3`}
                      </span>
                    </div>

                    {/* Level Steps Visual Progression */}
                    <div className="grid grid-cols-3 gap-2">
                      {[1, 2, 3].map((step) => {
                        const isReached = actualLevel >= step;
                        const rentAtStep =
                          inspectedProperty.rentValues?.[step] || 25;
                        const rentPrev =
                          inspectedProperty.rentValues?.[step - 1] || 15;
                        const rentGain = rentAtStep - rentPrev;
                        return (
                          <div
                            key={step}
                            className={`p-2 rounded-xl border text-center transition-all ${
                              isReached
                                ? "border-[#2E7D52] bg-[#2E7D52]/10"
                                : "border-[var(--border-soft)] capsule-inset"
                            }`}
                          >
                            <div className="flex items-center justify-between text-[10px] font-bold">
                              <span
                                style={{
                                  color: isReached
                                    ? "#2E7D52"
                                    : "var(--text-sub)",
                                }}
                              >
                                Lvl {step}
                              </span>
                              <span className="font-mono text-[#2E7D52]">
                                {isReached ? "✓ Active" : `+${rentGain}L`}
                              </span>
                            </div>
                            <span
                              className="text-[10px] font-mono block mt-0.5"
                              style={{ color: "var(--text-main)" }}
                            >
                              Rs {rentAtStep}L Rent
                            </span>
                          </div>
                        );
                      })}
                    </div>

                    {/* What Happens When Level Increases Description */}
                    <div className="capsule-inset p-2.5 rounded-xl text-[11px] font-rounded space-y-1">
                      <strong
                        className="block text-[11.5px]"
                        style={{ color: "var(--text-main)" }}
                      >
                        What happens if property level is increased?
                      </strong>
                      <ul
                        className="list-disc list-inside space-y-1 opacity-90 leading-relaxed"
                        style={{ color: "var(--text-sub)" }}
                      >
                        <li>
                          <strong>Higher Rent Income:</strong> Base rent steps
                          up from initial{" "}
                          <span className="font-mono text-[#2E7D52]">
                            Rs {inspectedProperty.rentValues?.[0] || 15}L
                          </span>{" "}
                          to{" "}
                          <span className="font-mono text-[#2E7D52]">
                            Rs {inspectedProperty.rentValues?.[3] || 55}L
                          </span>{" "}
                          (+Rs{" "}
                          {inspectedProperty.rentIncreasePerLevel ||
                            Math.round(
                              ((inspectedProperty.rentValues?.[3] || 55) -
                                (inspectedProperty.rentValues?.[0] || 15)) /
                                3,
                            )}
                          L average rent increase per upgrade level).
                        </li>
                        <li>
                          <strong>Valuation Boost:</strong> Enhances the
                          property's value upto 30%.
                        </li>
                        <li>
                          <strong>Utility Infrastructure:</strong> Adding the
                          required utilities will provide the benefits above
                        </li>
                      </ul>
                    </div>
                  </div>

                  {/* LEVEL PROGRESS & ATTACH BID RESOURCES PANEL (FOR OWNED PLOTS) */}
                  {isOwnedByMe && (
                    <div className="p-3.5 rounded-2xl capsule-card border border-[var(--border-soft)] space-y-2.5">
                      <div className="flex items-center justify-between text-xs font-rounded font-bold">
                        <span style={{ color: "var(--text-main)" }}>
                          Property Level Progress ({attachedIds.length} / 3
                          Resources)
                        </span>
                        <span className="font-mono text-[#2E7D52]">
                          {actualLevel >= 3
                            ? "Level 3 Max Reached"
                            : `Level ${actualLevel} / 3`}
                        </span>
                      </div>

                      <div className="grid grid-cols-3 gap-1.5">
                        {[1, 2, 3].map((step) => (
                          <div
                            key={step}
                            className={`h-2 rounded-full transition-all duration-300 ${
                              actualLevel >= step
                                ? "bg-[#2E7D52]"
                                : "bg-black/15"
                            }`}
                          />
                        ))}
                      </div>

                      {/* Installed Resources */}
                      {attachedIds.length > 0 && (
                        <div className="flex items-center gap-1.5 flex-wrap pt-1">
                          {attachedIds.map((uId) => {
                            const util = KARACHI_UTILITIES.find(
                              (u) => u.id === Number(uId),
                            );
                            if (!util) return null;
                            return (
                              <span
                                key={uId}
                                className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-rounded font-bold border"
                                style={{
                                  backgroundColor: "var(--resource-badge-bg)",
                                  color: "var(--resource-badge-text)",
                                  borderColor: "var(--resource-badge-border)",
                                }}
                              >
                                <UtilityIcon
                                  id={util.id}
                                  className="w-3 h-3"
                                  style={{
                                    color: "var(--resource-icon-color)",
                                  }}
                                />
                                <span>{util.name}</span>
                              </span>
                            );
                          })}
                        </div>
                      )}

                      {/* Attach Unassigned Resources Directly from Modal */}
                      {actualLevel < 3 && (
                        <div className="pt-2 border-t border-[var(--border-soft)] space-y-1.5">
                          <span
                            className="text-[11px] font-rounded font-bold block"
                            style={{ color: "var(--text-sub)" }}
                          >
                            Attach a Bid Resource to Upgrade (+1 Level):
                          </span>
                          {unassignedResources.length === 0 ? (
                            <div
                              className="p-2 rounded-xl capsule-inset text-[11px] font-rounded text-center"
                              style={{ color: "var(--text-sub)" }}
                            >
                              No unassigned Bid Resources in your inventory. Win
                              resources in the Admin Bid!
                            </div>
                          ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                              {unassignedResources.map((res) => {
                                const alreadyInstalled = attachedIds.includes(
                                  res.utilityId,
                                );
                                return (
                                  <button
                                    key={res.instanceId}
                                    type="button"
                                    disabled={alreadyInstalled}
                                    onClick={() =>
                                      handleInstallUtility(
                                        inspectedProperty.id,
                                        res.utilityId,
                                      )
                                    }
                                    className={`px-3 py-1.5 rounded-xl text-xs font-rounded font-bold flex items-center justify-between border transition-all cursor-pointer ${
                                      alreadyInstalled
                                        ? "opacity-40 cursor-not-allowed border-transparent capsule-inset"
                                        : "border-[#2E7D52]/50 capsule-inset hover:border-[#2E7D52]"
                                    }`}
                                    style={{ color: "var(--text-main)" }}
                                  >
                                    <span className="flex items-center gap-1.5 truncate">
                                      <UtilityIcon
                                        id={res.utilityId}
                                        className="w-3.5 h-3.5 shrink-0"
                                        style={{
                                          color: "var(--resource-icon-color)",
                                        }}
                                      />
                                      <span className="truncate">
                                        {res.name}
                                      </span>
                                    </span>
                                    <span className="font-mono text-[10px] font-bold text-[#2E7D52] shrink-0 ml-1">
                                      {alreadyInstalled ? "Added" : "+Attach"}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* PROPERTY DESCRIPTION & AREA CHALLENGES (ADMIN EDITABLE) */}
                  <div className="space-y-2 text-xs font-rounded">
                    <div className="p-3.5 rounded-2xl capsule-card border border-[var(--border-soft)] space-y-1">
                      <strong
                        className="block text-xs font-bold"
                        style={{ color: "var(--text-main)" }}
                      >
                        Property Description
                      </strong>
                      {inspectedProperty.description ||
                      inspectedProperty.importance ? (
                        <p
                          className="text-xs font-rounded leading-relaxed"
                          style={{ color: "var(--text-sub)" }}
                        >
                          {inspectedProperty.description ||
                            inspectedProperty.importance}
                        </p>
                      ) : (
                        <p
                          className="text-xs font-rounded italic opacity-60"
                          style={{ color: "var(--text-sub)" }}
                        >
                          Description will be updated from the Admin Portal.
                        </p>
                      )}
                    </div>

                    <div className="p-3.5 rounded-2xl capsule-card border border-[var(--border-soft)] space-y-1">
                      <strong className="block text-xs font-bold text-[#C0392B]">
                        Area Challenges
                      </strong>
                      {inspectedProperty.areaChallenges ||
                      inspectedProperty.problems ? (
                        <p
                          className="text-xs font-rounded leading-relaxed"
                          style={{ color: "var(--text-sub)" }}
                        >
                          {inspectedProperty.areaChallenges ||
                            inspectedProperty.problems}
                        </p>
                      ) : (
                        <p
                          className="text-xs font-rounded italic opacity-60"
                          style={{ color: "var(--text-sub)" }}
                        >
                          No area challenges recorded. To be updated from the
                          Admin Portal.
                        </p>
                      )}
                    </div>
                  </div>
                </motion.div>
              </div>
            );
          })()}
      </AnimatePresence>

      {/* TOAST */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
            className={`fixed bottom-5 right-5 z-50 px-4 py-2.5 rounded-2xl shadow-xl text-xs font-rounded font-bold ${
              toast.type === "error"
                ? "bg-[#C0392B] text-white"
                : "bg-[#2E7D52] text-white"
            }`}
          >
            {toast.message}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
