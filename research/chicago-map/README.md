# Chicago, as a map to build from

What the Chicago level (`src/scenes/chicago.ts`, `?scene=chicago`) is drawn from, gathered on 17 Nov 2026.

**How good this is.** Wikipedia and OpenStreetMap could not be opened from the build machine, so none of
it was read off a live page: it came from search-result snippets of Wikipedia articles and mirrors,
Structurae, the CTBUH Skyscraper Center and one OpenStreetMap node. Anything marked `est` is an estimate,
not a number that was found. Street lines are read off CTA station and bridge coordinates, good to about
15 m. Street widths were not found at all; every width is a guess. That is good enough for a level drawn
like a transit map (right order, right neighbours, wrong distances) and not good enough for anything else.

## What the level keeps, and what it does not

Kept: which streets there are and their order; which side of which street each landmark is on; the river's
main branch running east to the lake between Kinzie and Wacker Drive; the branch it forks into running
south past the Loop's west side; the lake front east of Lake Shore Drive, with Navy Pier at the foot of
Grand Avenue; Grant and Millennium Parks between Michigan Avenue and the lake; the L over Lake, Wabash,
Van Buren and Wells; the order of the towers by height.

Not kept: scale (about 1:3 across the ground, with streets widened to walk down; towers at about 1:16);
Franklin, Washington, Monroe, Ohio, Illinois and Harrison-to-Roosevelt (left out, to keep the block count
near the first city's); the North Branch's bend to the north-west (it runs straight north); Soldier Field
and the museum campus (off the south edge); the Chicago Picasso (Daley Plaza is there, empty).

## Landmarks

Latitude, longitude; architectural height (m); floors; year.

| Landmark | lat, lon | m | floors | year | Shape |
| --- | --- | --- | --- | --- | --- |
| Willis Tower | 41.8789, -87.6358 | 442.1 | 108 | 1973 | black bundled tubes, stepped setbacks, two white antennas |
| 875 N Michigan (John Hancock Center) | 41.8989, -87.6231 | 343.7 | 100 | 1969 | tapered black slab, X-bracing, two antennas |
| Trump International Hotel & Tower | 41.8889, -87.6264 | 423.2 | 98 (est) | 2009 | silver-blue glass, three setbacks, spire |
| Aon Center | 41.8853, -87.6214 | 346.3 | 83 | 1973 | plain white square shaft |
| St. Regis Chicago | 41.8872, -87.6172 | 362.9 | 101 | 2020 | three stepped wavy tubes, blue-green glass |
| Two Prudential Plaza | 41.8856, -87.6228 | 303.3 | 64 | 1990 | grey granite, chevron setbacks, spire |
| Marina City | 41.8880, -87.6288 | 179 | 65 | 1964 | twin beige concrete corncobs |
| Wrigley Building | 41.8897, -87.6247 | 130 | 30 | 1921 | white terracotta, clock tower |
| Tribune Tower | 41.8904, -87.6237 | 141 | 36 | 1925 | grey limestone Gothic, buttressed crown |
| Chicago Board of Trade | 41.8781, -87.6322 | 184 | 44 | 1930 | grey Art Deco, pyramid roof, statue of Ceres |
| 311 South Wacker | 41.8778, -87.6356 | 292.9 | 65 | 1990 | pink granite octagon, glowing glass crown |
| Chase Tower | 41.8816, -87.6301 | 259 | 60 | 1969 | grey granite slab with a flared base |
| Aqua | 41.8865, -87.6201 | 261.8 | 82 | 2009 | white rippling balconies over glass |
| Merchandise Mart | 41.8883, -87.6356 | 103.6 | 25 | 1930 | huge buff limestone block |
| Chicago Water Tower | 41.8972, -87.6244 | 55.6 | | 1869 | small yellow limestone castle |
| Art Institute of Chicago | 41.8796, -87.6237 | 24 (est) | 3 (est) | 1893 | low grey Beaux-Arts palace |
| Cloud Gate | 41.8827, -87.6233 | 10 | | 2006 | mirror-polished steel bean, 20 m long |
| Buckingham Fountain | 41.8758, -87.6189 | 46 (jet) | | 1927 | pink marble tiers in an 85 m pool |
| Navy Pier | 41.8914, -87.5997 | | | 1916 | pier about 1 km long, brick headhouse |
| Union Station | 41.8786, -87.6403 | 35 (est) | 8 (est) | 1925 | squat grey limestone block |
| Chicago Cultural Center | 41.8839, -87.6250 | 32 | 5 | 1897 | grey neoclassical block, two domes |
| Harold Washington Library | 41.8763, -87.6282 | 50 (est) | 10 | 1991 | red brick on granite, green roof ornaments |
| The Rookery | 41.8791, -87.6321 | 55 (est) | 12 (est) | 1888 | dark red-brown brick |
| Daley Center | 41.8839, -87.6302 | 198 | 31 | 1965 | rust-brown Cor-Ten slab |

Sources disagree on some: Aqua is 82 floors or 86, Trump 92 to 98, Willis often 110, Chase Tower 259 m or
264.6 m, the Water Tower 55.6 m or about 47 m.

## Streets

North-south, west to east, longitude at latitude 41.88 (`est` marked *): Canal -87.6396*, Wacker
-87.6368*, Franklin -87.6354*, Wells -87.6338, LaSalle -87.6324*, Clark -87.6309, Dearborn -87.6294*,
State -87.6279, Wabash -87.6261, Michigan -87.6244, Columbus -87.6207, Lake Shore Drive -87.6170*.

East-west, north to south, latitude at longitude -87.63: Chicago 41.8967, Ohio 41.8925*, Grand 41.8917,
Illinois 41.8908*, Kinzie 41.8892, Wacker 41.8869*, Lake 41.8857, Randolph 41.8845*, Washington 41.8832,
Madison 41.8819, Monroe 41.8807, Adams 41.8794, Jackson 41.8781, Van Buren 41.8768, Ida B. Wells
(Congress) 41.8756, Harrison 41.8743*, Roosevelt 41.8673.

Block pitch: about 126 m east-west, 141 m north-south.

## Water

- Main Branch: centre line at 41.8889 (Michigan), 41.8875 (State, LaSalle); about 70 m wide (est); the
  lock at -87.6064; the fork at about -87.6375 (est).
- South Branch: at -87.6382 (Madison), -87.6378 (Jackson), -87.6347 (Roosevelt); about 60 m wide (est).
- Bridges over the Main Branch, east to west: Lake Shore Drive, Columbus, DuSable (Michigan), Wabash,
  State, Dearborn, Clark, LaSalle, Wells (carries the L), Franklin-Orleans.
- Bridges over the South Branch, north to south: Lake (carries the L), Randolph, Washington, Madison,
  Monroe, Adams, Jackson, Van Buren, Congress.
- Lake shore longitude (all est): -87.6185 at 41.900, -87.6120 at 41.892, -87.6162 at 41.882, -87.6160
  at 41.876.
- Millennium Park: 41.8845 to 41.8807, -87.6244 to -87.6207. Grant Park: 41.8845 to 41.8673, -87.6244 to
  -87.6160 (est).
- The L: Lake St (north), Wabash Ave (east), Van Buren St (south), Wells St (west).

## Sources

Read as search snippets, not as pages:

- en.wikipedia.org: 875 North Michigan Avenue; Two Prudential Plaza; Wrigley Building; Chicago Board of
  Trade Building; Merchandise Mart; Chicago Water Tower; Buckingham Fountain; Richard J. Daley Center;
  DuSable Bridge; La Salle Street Bridge (Chicago); Madison Street Bridge (Chicago); List of crossings of
  the Chicago River; Kinzie Street railroad bridge; Quincy, LaSalle/Van Buren, Grand (Red Line),
  Harrison and LaSalle CTA stations
- skyscrapercenter.com: Aon Center; The St. Regis Chicago
- structurae.net: Roosevelt Road Bridge; Chicago Avenue Bridge; Columbus Drive Bridge
- openstreetmap.org node 5073776567
- chicagoloopbridges.com; chicagoparkdistrict.com
