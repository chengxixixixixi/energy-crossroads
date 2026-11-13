// Stylised shipping routes (hand-placed sea waypoints, lon/lat). Tier: ILLUSTRATIVE.
// Widths indicate approximate relative importance, informed by EIA's finding that ~84% of
// Hormuz crude and ~83% of its LNG went to Asia in 2024. These are not AIS tracks.

export const HORMUZ = { lon: 56.45, lat: 26.55, name: "Strait of Hormuz" };

const GULF_EXIT = [[50.5, 27.2], [53.5, 26.4], [56.45, 26.55], [57.6, 25.3], [59.5, 23.6]];

export const ROUTES = [
  { id: "ea", label: "Crude & LNG to East Asia (via Malacca)", kind: "oil", weight: 5, pts: [...GULF_EXIT, [63, 19], [72, 9], [80.5, 5.2], [92, 6], [97.5, 5.2], [100.5, 3], [103.8, 1.2], [108, 5], [112, 11], [116.5, 17], [120.5, 21.5], [123, 26], [127, 30.5], [131, 33], [136.5, 34.2]] },
  { id: "cn", label: "Crude to China", kind: "oil", weight: 4, pts: [[120.5, 21.5], [121.2, 25], [122.4, 29.5], [122.2, 31.2]] },
  { id: "kr", label: "Crude to Korea", kind: "oil", weight: 2, pts: [[127, 30.5], [128.5, 33.5], [129.4, 35.2]] },
  { id: "in", label: "Crude to India (west coast)", kind: "oil", weight: 3, pts: [...GULF_EXIT, [63, 22], [68.5, 22.3], [72.6, 19.1]] },
  { id: "pk", label: "LNG & products to Pakistan", kind: "lng", weight: 2, pts: [...GULF_EXIT, [62.5, 24], [66.9, 24.7]] },
  { id: "bd", label: "LNG to Bangladesh", kind: "lng", weight: 1.5, pts: [[80.5, 5.2], [84, 11], [88.5, 18], [91.6, 21.9]] },
  { id: "eu-suez", label: "To Europe via Bab-el-Mandeb & Suez", kind: "oil", weight: 2, pts: [...GULF_EXIT, [58, 18.5], [52, 13], [45.5, 12], [43.4, 12.6], [41, 15.5], [37.5, 21], [33.8, 27.3], [32.55, 29.9], [32.3, 31.4], [26, 33.5], [15, 36.5], [8, 38.5], [-5.6, 36]] },
  { id: "eu-cape", label: "To Europe via the Cape", kind: "oil", weight: 1, pts: [[59.5, 23.6], [56, 10], [50, -5], [43, -20], [33, -32], [20, -36.5], [10, -30], [2, -12], [-8, 2], [-18, 18], [-14, 32], [-9.5, 40]] },
  { id: "pac", label: "Products from Singapore to the Pacific", kind: "product", weight: 1.5, pts: [[103.8, 1.2], [110, -4], [118, -7.5], [127, -8.8], [138, -9.5], [150, -12], [162, -15], [172, -17], [179.5, -17.5]] },
  { id: "io", label: "Products to Indian Ocean islands", kind: "product", weight: 1, pts: [[59.5, 23.6], [62, 14], [68, 6], [73.2, 4.2], [72, -1], [62, -10], [56, -5], [50, -10], [44, -11.7]] },
];

export const BYPASS = [
  { id: "ewp", label: "East–West pipeline (Abqaiq → Yanbu)", pts: [[49.7, 25.9], [46.5, 25.2], [43, 24.6], [38.1, 24.1]] },
  { id: "adcop", label: "ADCOP (Habshan → Fujairah)", pts: [[53.7, 23.8], [55.2, 24.4], [56.35, 25.12]] },
];

export const CHOKEPOINTS = [
  { id: "malacca", name: "Malacca", lon: 100.5, lat: 3 },
  { id: "bab", name: "Bab-el-Mandeb", lon: 43.4, lat: 12.6 },
  { id: "suez", name: "Suez", lon: 32.55, lat: 29.9 },
  { id: "cape", name: "Cape of Good Hope", lon: 19, lat: -35.2 },
];
