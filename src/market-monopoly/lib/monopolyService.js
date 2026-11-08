import { createClient } from '@supabase/supabase-js';
import {
  KARACHI_PROPERTIES,
  KARACHI_UTILITIES,
  DEFAULT_MONOPOLY_TEAMS,
  STARTING_BUDGET_LAKH,
  computePropertyRent,
  computePropertyValuation
} from '../data/monopolyData.js';

export const SUPABASE_URL = 'https://dvynsvvmqaibybjdsukb.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR2eW5zdnZtcWFpYnliamRzdWtiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM5NTg1NDIsImV4cCI6MjEwOTUzNDU0Mn0.F_J9N24gb-MDT4NkOoLufVWasvvGiAosRNRZUNiEJQE';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  },
  realtime: {
    params: {
      eventsPerSecond: 15
    }
  }
});

export function getInitialStore() {
  return {
    currentRound: 1,
    activeAuctionPropertyId: 1,
    currentWheelRound: 1,
    wheelSpinsByRound: {},
    lastWheelResult: null,
    teams: [],
    properties: KARACHI_PROPERTIES.map((p) => ({
      ...p,
      ownerTeamId: null,
      ownerTeamName: null,
      purchasePrice: 0,
      upgradeLevel: 0,
      attachedUtilities: []
    })),
    transactions: [],
    updatedAt: Date.now()
  };
}

export function hydrateMonopolyState(rawState) {
  const fallback = getInitialStore();
  if (!rawState || typeof rawState !== 'object') return fallback;

  const teams = (Array.isArray(rawState.teams) ? rawState.teams : []).map((t) => ({
    ...t,
    username: (t.username || t.name || '').toLowerCase().replace(/\s+/g, '_'),
    cash: Number(t.cash ?? t.startingBudget ?? STARTING_BUDGET_LAKH),
    startingBudget: Number(t.startingBudget ?? t.starting_budget ?? STARTING_BUDGET_LAKH),
    ownedResources: Array.isArray(t.ownedResources)
      ? t.ownedResources
      : Array.isArray(t.owned_resources)
      ? t.owned_resources
      : []
  }));

  const mergedProps = KARACHI_PROPERTIES.map((baseProp) => {
    const savedProp = (rawState.properties || []).find(
      (p) => Number(p.id) === Number(baseProp.id)
    );
    const ownerTeam = savedProp?.ownerTeamId
      ? teams.find(
          (t) =>
            String(t.id) === String(savedProp.ownerTeamId) ||
            (savedProp.ownerTeamName &&
              t.name.toLowerCase() === String(savedProp.ownerTeamName).toLowerCase())
        )
      : null;

    const name = (savedProp?.name || baseProp.name || '').trim();
    const category = (savedProp?.category || baseProp.category || '').trim();
    const description = (
      savedProp?.description !== undefined && savedProp?.description !== null && String(savedProp?.description).trim() !== ''
        ? String(savedProp.description).trim()
        : (savedProp?.importance || baseProp.description || baseProp.importance || '').trim()
    );
    const areaChallenges = (
      savedProp?.areaChallenges !== undefined && savedProp?.areaChallenges !== null && String(savedProp?.areaChallenges).trim() !== ''
        ? String(savedProp.areaChallenges).trim()
        : (savedProp?.area_challenges || savedProp?.problems || baseProp.areaChallenges || baseProp.problems || '').trim()
    );

    const openingValue =
      savedProp?.openingValue !== undefined && Number(savedProp.openingValue) > 0
        ? Number(savedProp.openingValue)
        : Number(baseProp.openingValue);
    const level3Target =
      savedProp?.level3Target !== undefined && Number(savedProp.level3Target) > 0
        ? Number(savedProp.level3Target)
        : Number(baseProp.level3Target);
    const valueIncreasePerLevel =
      savedProp?.valueIncreasePerLevel !== undefined && Number(savedProp.valueIncreasePerLevel) >= 0
        ? Number(savedProp.valueIncreasePerLevel)
        : Math.round((level3Target - openingValue) / 3);
    const rentValues =
      Array.isArray(savedProp?.rentValues) && savedProp.rentValues.length === 4
        ? savedProp.rentValues.map(Number)
        : baseProp.rentValues.map(Number);
    const rentIncreasePerLevel =
      savedProp?.rentIncreasePerLevel !== undefined && Number(savedProp.rentIncreasePerLevel) >= 0
        ? Number(savedProp.rentIncreasePerLevel)
        : Math.round((rentValues[3] - rentValues[0]) / 3);
    const upgradeCosts =
      Array.isArray(savedProp?.upgradeCosts) && savedProp.upgradeCosts.length === 3
        ? savedProp.upgradeCosts.map(Number)
        : baseProp.upgradeCosts.map(Number);
    const purchasePrice = Number(
      savedProp?.purchasePrice ?? savedProp?.purchase_price ?? savedProp?.auctionedPrice ?? 0
    );

    return {
      ...baseProp,
      ...(savedProp || {}),
      name,
      category,
      description,
      importance: description,
      areaChallenges,
      problems: areaChallenges,
      openingValue,
      basePrice: openingValue,
      level3Target,
      valueIncreasePerLevel,
      rentValues,
      initialRent: rentValues[0],
      rentIncreasePerLevel,
      upgradeCosts,
      maxLevel: 3,
      ownerTeamId: ownerTeam ? ownerTeam.id : savedProp?.ownerTeamId || null,
      ownerTeamName: ownerTeam ? ownerTeam.name : savedProp?.ownerTeamName || null,
      purchasePrice,
      auctionedPrice: purchasePrice,
      upgradeLevel: Math.min(3, Math.max(0, Number(savedProp?.upgradeLevel || 0))),
      attachedUtilities: Array.isArray(savedProp?.attachedUtilities)
        ? savedProp.attachedUtilities.map(Number)
        : []
    };
  });

  return {
    currentRound: Number(rawState.currentRound || 1),
    activeAuctionPropertyId: Number(rawState.activeAuctionPropertyId || 1),
    currentWheelRound: Number(rawState.currentWheelRound || 1),
    wheelSpinsByRound:
      rawState.wheelSpinsByRound && typeof rawState.wheelSpinsByRound === 'object'
        ? rawState.wheelSpinsByRound
        : {},
    lastWheelResult: rawState.lastWheelResult || null,
    teams,
    properties: mergedProps,
    transactions: (Array.isArray(rawState.transactions) ? rawState.transactions : []).filter(
      (tx) => tx.type !== 'TEAM_CREATED' && tx.type !== 'TEAM_DELETED'
    ),
    updatedAt: rawState.updatedAt || Date.now()
  };
}

// Local in-memory caching to avoid redundant network overhead
let _cachedStore = null;
let _cachedAt = 0;
const CACHE_TTL_MS = 1200; // 1.2s cache for read deduplication

export function getCachedMonopolyStore() {
  if (_cachedStore && Date.now() - _cachedAt < CACHE_TTL_MS) {
    return _cachedStore;
  }
  return null;
}

export function invalidateMonopolyStoreCache() {
  _cachedStore = null;
  _cachedAt = 0;
}

/**
 * Fetch authoritative Market Monopoly state from Supabase (`public.monopoly_state` row id=1)
 */
export async function fetchMonopolyStore(forceFresh = false) {
  if (!forceFresh && _cachedStore && Date.now() - _cachedAt < CACHE_TTL_MS) {
    return _cachedStore;
  }

  const [stateRes, teamsRes] = await Promise.all([
    supabase.from('monopoly_state').select('state_json').eq('id', 1).maybeSingle(),
    supabase.from('monopoly_teams').select('id, name, username, passcode, cash, starting_budget, owned_resources').order('updated_at', { ascending: true })
  ]);

  if (stateRes.error) {
    throw new Error(`Supabase fetchMonopolyStore error: ${stateRes.error.message}`);
  }

  const dbTeams = Array.isArray(teamsRes.data)
    ? teamsRes.data.map((row) => ({
        id: String(row.id),
        name: row.name,
        username: (row.username || row.name || '').toLowerCase().replace(/\s+/g, '_'),
        passcode: String(row.passcode || '1234'),
        cash: Number(row.cash ?? row.starting_budget ?? STARTING_BUDGET_LAKH),
        startingBudget: Number(row.starting_budget ?? STARTING_BUDGET_LAKH),
        ownedResources: Array.isArray(row.owned_resources) ? row.owned_resources : []
      }))
    : null;

  let result;
  if (stateRes.data?.state_json && typeof stateRes.data.state_json === 'object') {
    const raw = { ...stateRes.data.state_json };
    if (dbTeams !== null) {
      raw.teams = dbTeams;
    } else if (!Array.isArray(raw.teams)) {
      raw.teams = [];
    }
    result = hydrateMonopolyState(raw);
  } else {
    const initial = getInitialStore();
    if (dbTeams && dbTeams.length > 0) {
      initial.teams = dbTeams;
    }
    await persistMonopolyStore(initial);
    result = initial;
  }

  _cachedStore = result;
  _cachedAt = Date.now();
  return result;
}

/**
 * Persist authoritative Market Monopoly state to Supabase (`public.monopoly_state`, `monopoly_teams`, `monopoly_properties`)
 */
export async function persistMonopolyStore(nextStore) {
  const hydrated = hydrateMonopolyState({ ...nextStore, updatedAt: Date.now() });

  // Update memory cache immediately for instantaneous UI updates
  _cachedStore = hydrated;
  _cachedAt = Date.now();

  const compact = {
    currentRound: hydrated.currentRound,
    activeAuctionPropertyId: hydrated.activeAuctionPropertyId,
    currentWheelRound: hydrated.currentWheelRound || 1,
    wheelSpinsByRound: hydrated.wheelSpinsByRound || {},
    lastWheelResult: hydrated.lastWheelResult,
    teams: hydrated.teams,
    properties: hydrated.properties.map((p) => ({
      id: p.id,
      name: p.name,
      category: p.category,
      description: p.description || p.importance || '',
      importance: p.importance || p.description || '',
      areaChallenges: p.areaChallenges || p.problems || '',
      problems: p.problems || p.areaChallenges || '',
      openingValue: Number(p.openingValue || 0),
      basePrice: Number(p.openingValue || 0),
      level3Target: Number(p.level3Target || 0),
      valueIncreasePerLevel: Number(p.valueIncreasePerLevel || 0),
      rentIncreasePerLevel: Number(p.rentIncreasePerLevel || 0),
      rentValues: Array.isArray(p.rentValues) ? p.rentValues.map(Number) : [15, 25, 38, 55],
      initialRent: Array.isArray(p.rentValues) ? Number(p.rentValues[0]) : 15,
      upgradeCosts: Array.isArray(p.upgradeCosts) ? p.upgradeCosts.map(Number) : [10, 15, 20],
      ownerTeamId: p.ownerTeamId || null,
      ownerTeamName: p.ownerTeamName || null,
      purchasePrice: Number(p.purchasePrice || 0),
      auctionedPrice: Number(p.purchasePrice || 0),
      upgradeLevel: Math.min(3, Math.max(0, Number(p.upgradeLevel || 0))),
      attachedUtilities: Array.isArray(p.attachedUtilities) ? p.attachedUtilities : []
    })),
    transactions: (hydrated.transactions || []).slice(0, 120),
    updatedAt: hydrated.updatedAt
  };

  if (Array.isArray(hydrated.teams) && hydrated.teams.length > 0) {
    const teamRows = hydrated.teams.map((t) => ({
      id: String(t.id),
      name: t.name,
      username: (t.username || t.name || '').toLowerCase().replace(/\s+/g, '_'),
      passcode: String(t.passcode || '1234'),
      cash: Number(t.cash || 0),
      starting_budget: Number(t.startingBudget || STARTING_BUDGET_LAKH),
      owned_resources: Array.isArray(t.ownedResources) ? t.ownedResources : [],
      updated_at: new Date().toISOString()
    }));
    await supabase.from('monopoly_teams').upsert(teamRows, { onConflict: 'id' });
  }

  if (Array.isArray(hydrated.properties) && hydrated.properties.length > 0) {
    const propRows = hydrated.properties.map((p) => ({
      id: Number(p.id),
      name: p.name,
      category: p.category,
      opening_value: Number(p.openingValue || 0),
      level3_target: Number(p.level3Target || 0),
      upgrade_costs: p.upgradeCosts || [10, 15, 20],
      rent_values: p.rentValues || [15, 25, 38, 55],
      recommended_utilities: p.recommendedUtilities || [],
      owner_team_id: p.ownerTeamId || null,
      purchase_price: Number(p.purchasePrice || 0),
      upgrade_level: Number(p.upgradeLevel || 0),
      attached_utilities: p.attachedUtilities || [],
      updated_at: new Date().toISOString()
    }));
    await supabase.from('monopoly_properties').upsert(propRows, { onConflict: 'id' });
  }

  const { error: stateErr } = await supabase
    .from('monopoly_state')
    .upsert(
      {
        id: 1,
        state_json: compact,
        updated_at: new Date().toISOString()
      },
      { onConflict: 'id' }
    );

  if (stateErr) {
    throw new Error(`Supabase persistMonopolyStore error: ${stateErr.message}`);
  }

  return hydrated;
}

/**
 * Server-Side Supabase Team Authentication (`monopoly_team_auth` RPC + `monopoly_state` sync)
 * Accepts Team Username, Team Name, or Team ID + Passcode
 */
export async function authenticateMonopolyTeam({ identifier, passcode }) {
  const cleanId = (identifier || '').trim();
  const cleanCode = (passcode || '').trim();

  if (!cleanId) throw new Error('Enter your team username or team name.');
  if (!cleanCode) throw new Error('Enter your team passcode.');

  // 1. Fetch latest authoritative store from Supabase so any newly created team is present
  const latestStore = await fetchMonopolyStore();

  // 2. Call Supabase Postgres RPC `monopoly_team_auth`
  const { data: rpcResult, error: rpcErr } = await supabase.rpc('monopoly_team_auth', {
    p_identifier: cleanId,
    p_passcode: cleanCode
  });

  if (!rpcErr && rpcResult) {
    if (!rpcResult.ok) {
      throw new Error(rpcResult.error || 'Authentication failed.');
    }
    const matched =
      latestStore.teams.find((t) => String(t.id) === String(rpcResult.team?.id)) ||
      rpcResult.team;
    return { team: matched, store: latestStore };
  }

  // Fallback check against latestStore.teams if RPC is unavailable
  const found = latestStore.teams.find(
    (t) =>
      t.name.toLowerCase() === cleanId.toLowerCase() ||
      (t.username && t.username.toLowerCase() === cleanId.toLowerCase()) ||
      t.id.toLowerCase() === cleanId.toLowerCase()
  );

  if (!found) {
    throw new Error('Team username not found. Check with the organizer desk.');
  }
  if (String(found.passcode).trim() !== cleanCode) {
    throw new Error('Incorrect team passcode.');
  }

  return { team: found, store: latestStore };
}

/**
 * Attach a Bid-Won Resource onto an Owned Property to Advance its Level-Up Progress Line (Max Level 3)
 * Resources can only be obtained from the Admin Bid (money is deducted when Admin assigns the resource).
 */
export async function attachUtilityToProperty({ store, teamId, propertyId, utilityId }) {
  const latest = await fetchMonopolyStore();
  const prop = latest.properties.find((p) => Number(p.id) === Number(propertyId));
  const team = latest.teams.find((t) => String(t.id) === String(teamId));
  const util = KARACHI_UTILITIES.find((u) => Number(u.id) === Number(utilityId));

  if (!prop || !team || !util) {
    throw new Error('Property, team, or resource not found.');
  }
  const isOwner =
    String(prop.ownerTeamId) === String(team.id) ||
    (prop.ownerTeamName && prop.ownerTeamName.toLowerCase() === team.name.toLowerCase());

  if (!isOwner) {
    throw new Error('You can only attach resources to properties owned by your team.');
  }
  if (prop.attachedUtilities.length >= 3 || Number(prop.upgradeLevel || 0) >= 3) {
    throw new Error(`${prop.name} is already at Max Level 3 (3/3 resources attached).`);
  }
  if (prop.attachedUtilities.includes(util.id)) {
    throw new Error(`${util.name} is already attached to ${prop.name}.`);
  }

  const ownedList = Array.isArray(team.ownedResources) ? team.ownedResources : [];
  const availableIdx = ownedList.findIndex(
    (r) => Number(r.utilityId) === Number(util.id) && !r.attachedToPropertyId
  );

  if (availableIdx === -1) {
    throw new Error(
      `You do not have an unassigned ${util.name}. Resources can only be won in the Admin Bid.`
    );
  }

  const nextOwnedResources = ownedList.map((r, idx) =>
    idx === availableIdx ? { ...r, attachedToPropertyId: prop.id, attachedToPropertyName: prop.name } : r
  );

  const nextTeams = latest.teams.map((t) =>
    String(t.id) === String(team.id) ? { ...t, ownedResources: nextOwnedResources } : t
  );

  const nextAttached = [...prop.attachedUtilities, util.id];
  const nextLevel = Math.min(3, nextAttached.length);

  const nextProps = latest.properties.map((p) =>
    Number(p.id) === Number(prop.id)
      ? {
          ...p,
          attachedUtilities: nextAttached,
          upgradeLevel: nextLevel
        }
      : p
  );

  const tx = {
    id: `tx_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    type: 'RESOURCE_LEVEL_UP',
    teamId: team.id,
    teamName: team.name,
    propertyId: prop.id,
    propertyName: prop.name,
    utilityId: util.id,
    utilityName: util.name,
    amount: 0,
    note: `${team.name} attached ${util.name} to ${prop.name} -> Level ${nextLevel}/3`,
    createdAt: new Date().toISOString()
  };

  await supabase.from('monopoly_transactions').upsert({
    id: tx.id,
    type: tx.type,
    team_id: tx.teamId,
    team_name: tx.teamName,
    property_id: tx.propertyId,
    property_name: tx.propertyName,
    utility_id: tx.utilityId,
    utility_name: tx.utilityName,
    amount: tx.amount,
    note: tx.note,
    created_at: tx.createdAt
  });

  return persistMonopolyStore({
    ...latest,
    teams: nextTeams,
    properties: nextProps,
    transactions: [tx, ...(latest.transactions || [])]
  });
}

export async function upgradePropertyLevel() {
  throw new Error('Properties level up by attaching Bid Resources (Max Level 3), not by cash.');
}

/**
 * Automatic Supabase-Backed Wheel Spin & Rent Settlement:
 * Deducts rent from the spinning team and credits the owner of the landed property automatically.
 */
export async function executeTeamWheelSpinAndPayRent({ store, teamId, propertyId }) {
  const latest = await fetchMonopolyStore();
  const prop = latest.properties.find((p) => Number(p.id) === Number(propertyId));
  const payer = latest.teams.find((t) => String(t.id) === String(teamId));

  if (!prop) throw new Error('Selected property not found.');
  if (!payer) throw new Error('Spinning team not found.');

  const activeWheelRound = Number(latest.currentWheelRound || 1);
  const currentRoundSpins = (latest.wheelSpinsByRound || {})[activeWheelRound] || {};

  if (currentRoundSpins[payer.id]) {
    throw new Error(
      `${payer.name} already spun in Spin #${activeWheelRound}. Wait for the Admin to release Spin #${activeWheelRound + 1}.`
    );
  }

  const owner = prop.ownerTeamId
    ? latest.teams.find(
        (t) =>
          String(t.id) === String(prop.ownerTeamId) ||
          (prop.ownerTeamName && t.name.toLowerCase() === String(prop.ownerTeamName).toLowerCase())
      )
    : null;

  let rentAmount = 0;
  let status = 'UNOWNED';
  let note = `Spin #${activeWheelRound}: ${payer.name} landed on ${prop.name} (Unowned — Rs 0 Lakh rent)`;

  if (owner && String(owner.id) === String(payer.id)) {
    status = 'OWN_PROPERTY';
    note = `Spin #${activeWheelRound}: ${payer.name} landed on their own property ${prop.name} (Rs 0 Lakh rent)`;
  } else if (owner) {
    status = 'PAID_RENT';
    rentAmount = computePropertyRent(prop);
    note = `Spin #${activeWheelRound}: ${payer.name} landed on ${prop.name} and paid Rs ${rentAmount} Lakh rent to ${owner.name}`;
  }

  const nextTeams = latest.teams.map((t) => {
    if (status === 'PAID_RENT') {
      if (String(t.id) === String(payer.id)) {
        return { ...t, cash: Number((t.cash - rentAmount).toFixed(2)) };
      }
      if (owner && String(t.id) === String(owner.id)) {
        return { ...t, cash: Number((t.cash + rentAmount).toFixed(2)) };
      }
    }
    return t;
  });

  const spinRecord = {
    wheelRound: activeWheelRound,
    teamId: payer.id,
    teamName: payer.name,
    propertyId: prop.id,
    propertyName: prop.name,
    ownerTeamId: owner ? owner.id : null,
    ownerTeamName: owner ? owner.name : 'Unowned',
    rentAmount,
    status,
    timestamp: new Date().toISOString()
  };

  const nextWheelSpinsByRound = {
    ...(latest.wheelSpinsByRound || {}),
    [activeWheelRound]: {
      ...currentRoundSpins,
      [payer.id]: spinRecord
    }
  };

  const tx = {
    id: `tx_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    type: 'WHEEL_RENT',
    teamId: payer.id,
    teamName: payer.name,
    targetTeamId: owner ? owner.id : null,
    targetTeamName: owner ? owner.name : null,
    propertyId: prop.id,
    propertyName: prop.name,
    amount: rentAmount,
    note,
    createdAt: new Date().toISOString()
  };

  await supabase.from('monopoly_transactions').upsert({
    id: tx.id,
    type: tx.type,
    team_id: tx.teamId,
    team_name: tx.teamName,
    target_team_id: tx.targetTeamId,
    target_team_name: tx.targetTeamName,
    property_id: tx.propertyId,
    property_name: tx.propertyName,
    amount: tx.amount,
    note: tx.note,
    created_at: tx.createdAt
  });

  return persistMonopolyStore({
    ...latest,
    teams: nextTeams,
    wheelSpinsByRound: nextWheelSpinsByRound,
    lastWheelResult: spinRecord,
    transactions: [tx, ...(latest.transactions || [])]
  });
}

/**
 * Compute full portfolio metrics for a Team (matches by both team ID and team Name)
 */
export function computeTeamSummary(team, properties = []) {
  if (!team) {
    return {
      cash: 0,
      startingBudget: 500,
      totalDeducted: 0,
      propertySpent: 0,
      resourceSpent: 0,
      resourceCount: 0,
      propertyCount: 0,
      propertyValuation: 0,
      totalRentPotential: 0,
      totalRentPower: 0,
      netWorth: 0,
      ownedProperties: []
    };
  }
  const owned = (properties || []).filter(
    (p) =>
      (p.ownerTeamId && String(p.ownerTeamId) === String(team.id)) ||
      (p.ownerTeamName &&
        team.name &&
        String(p.ownerTeamName).toLowerCase() === String(team.name).toLowerCase())
  );
  const propVal = owned.reduce((sum, p) => sum + computePropertyValuation(p), 0);
  const propSpent = owned.reduce((sum, p) => sum + Number(p.purchasePrice || p.openingValue || 0), 0);
  const ownedResList = Array.isArray(team?.ownedResources) ? team.ownedResources : [];
  const resSpent = ownedResList.reduce((sum, r) => sum + Number(r.bidPrice || 0), 0);
  const unattachedResVal = ownedResList
    .filter((r) => !r.attachedToPropertyId)
    .reduce((sum, r) => sum + Number(r.bidPrice || 0), 0);
  const totalRentPotential = owned.reduce((sum, p) => sum + computePropertyRent(p), 0);
  const cash = Number(team?.cash || 0);
  const startingBudget = Number(team?.startingBudget ?? STARTING_BUDGET_LAKH);
  const totalDeducted = Number((propSpent + resSpent).toFixed(2));
  const netWorth = Number((cash + propVal + unattachedResVal).toFixed(2));

  return {
    ...team,
    cash,
    startingBudget,
    totalDeducted,
    propertySpent: propSpent,
    resourceSpent: resSpent,
    resourceCount: ownedResList.length,
    propertyCount: owned.length,
    propertyValuation: propVal,
    totalRentPotential,
    totalRentPower: totalRentPotential,
    netWorth,
    ownedProperties: owned
  };
}
