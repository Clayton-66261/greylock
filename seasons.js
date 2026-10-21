/*
  Greylock — Massachusetts hunting seasons and quick rules.
  Source: MassWildlife "Massachusetts Hunting Season Summary" (2026) and the
  Mass.gov deer hunting regulations page, checked 2026-10-21.

  To update for a new year: add a new [start, end] pair to each season's
  `ranges`, bump `checked`, and redeploy. Dates are inclusive, local time.

  zones:            "all" or an array of Wildlife Management Zone numbers (4N/4S count as 4)
  waterfowlZone:    Berkshire / Central / Coastal (these are not WMZs)
  closedDuringShotgun: true if the season closes during shotgun deer season
  days:             optional weekday filter, 0 = Sunday … 6 = Saturday
*/
window.MA_REGS = {
  checked: "2026-10-21",
  sources: [
    { label: "MassWildlife season summary (PDF)", url: "https://www.mass.gov/doc/massachusetts-hunting-season-dates-printable/download" },
    { label: "Deer hunting regulations", url: "https://www.mass.gov/info-details/deer-hunting-regulations" },
    { label: "Wildlife Management Zone map", url: "https://www.mass.gov/info-details/wildlife-management-zone-map" },
    { label: "MassFishHunt (licenses and harvest reporting)", url: "https://massfishhunt.mass.gov/" }
  ],
  // Shotgun deer season windows, used to close the starred small-game seasons
  shotgunWindows: [["2026-11-30", "2026-12-12"], ["2027-11-29", "2027-12-11"]],

  seasons: [
    // Deer
    { group: "Deer", name: "Early deer season", zones: [13, 14], ranges: [["2026-09-21", "2026-10-01"], ["2027-09-20", "2027-09-30"]], note: "Archery or primitive firearms. Blaze orange required." },
    { group: "Deer", name: "Youth deer hunt", zones: "all", ranges: [["2026-10-02", "2026-10-03"], ["2027-10-01", "2027-10-02"]], note: "Ages 12–17 with the free youth deer permit." },
    { group: "Deer", name: "Archery deer", zones: "all", ranges: [["2026-10-05", "2026-11-28"], ["2027-10-04", "2027-11-27"]], note: "Archery stamp required. Decoys allowed." },
    { group: "Deer", name: "Paraplegic hunt", zones: "all", ranges: [["2026-10-29", "2026-10-31"], ["2027-10-28", "2027-10-30"]], note: "Special permit hunt." },
    { group: "Deer", name: "Shotgun deer", zones: "all", ranges: [["2026-11-30", "2026-12-12"], ["2027-11-29", "2027-12-11"]], note: "500 sq in of blaze orange. First-week deer must go to a check station." },
    { group: "Deer", name: "Primitive firearms deer", zones: "all", ranges: [["2026-12-14", "2026-12-31"], ["2027-12-13", "2027-12-31"]], note: "Primitive firearms stamp for muzzleloaders. Blaze orange required." },
    { group: "Deer", name: "Winter deer season", zones: [9, 10, 11], ranges: [["2027-01-01", "2027-01-30"]], note: "New for 2027. Archery or primitive firearms, 2027 license, orange required." },
    { group: "Deer", name: "Winter deer season", zones: [13, 14], ranges: [["2026-01-01", "2026-02-14"], ["2027-01-01", "2027-02-13"]], note: "Archery or primitive firearms, orange required." },

    // Other big game
    { group: "Big game", name: "Black bear", zones: "all", ranges: [["2026-09-07", "2026-12-12"]], note: "" },
    { group: "Big game", name: "Wild turkey, spring", zones: [1,2,3,4,5,6,7,8,9,10,11,12,13], ranges: [["2026-04-27", "2026-05-23"]], note: "Youth turkey hunt was April 25, 2026." },
    { group: "Big game", name: "Wild turkey, fall", zones: [1,2,3,4,5,6,7,8,9,10,11,12,13], ranges: [["2026-10-05", "2026-11-28"]], note: "" },

    // Upland and small game (starred = closed during shotgun deer season)
    { group: "Upland and small game", name: "Pheasant", zones: "all", ranges: [["2026-10-17", "2026-12-31"]], closedDuringShotgun: true, note: "Orange hat for deer hunters on stocked WMAs." },
    { group: "Upland and small game", name: "Quail", zones: "all", ranges: [["2026-10-17", "2026-12-31"]], closedDuringShotgun: true, note: "" },
    { group: "Upland and small game", name: "Ruffed grouse", zones: "all", ranges: [["2026-10-17", "2026-11-28"]], note: "" },
    { group: "Upland and small game", name: "Gray squirrel", zones: "all", ranges: [["2026-09-08", "2027-02-27"]], closedDuringShotgun: true, note: "" },
    { group: "Upland and small game", name: "Cottontail rabbit", zones: "all", ranges: [["2026-10-17", "2027-02-27"]], closedDuringShotgun: true, note: "" },
    { group: "Upland and small game", name: "Snowshoe hare", zones: "all", ranges: [["2026-10-17", "2027-02-27"]], closedDuringShotgun: true, note: "" },
    { group: "Upland and small game", name: "Crow", zones: "all", ranges: [["2026-07-01", "2027-04-10"]], closedDuringShotgun: true, days: [1, 5, 6], note: "Mondays, Fridays and Saturdays only." },

    // Furbearers
    { group: "Furbearers", name: "Coyote", zones: "all", ranges: [["2026-10-17", "2027-03-08"]], note: "Check MassWildlife for night-hunting rules during shotgun season." },
    { group: "Furbearers", name: "Fox, red or gray", zones: "all", ranges: [["2026-11-02", "2027-02-27"]], closedDuringShotgun: true, note: "" },
    { group: "Furbearers", name: "Raccoon", zones: "all", ranges: [["2026-10-01", "2027-01-30"]], closedDuringShotgun: true, note: "" },
    { group: "Furbearers", name: "Opossum", zones: "all", ranges: [["2026-10-01", "2027-01-30"]], closedDuringShotgun: true, note: "" },
    { group: "Furbearers", name: "Bobcat", zones: [1,2,3,4,5,6,7,8], ranges: [["2026-12-21", "2027-03-08"]], closedDuringShotgun: true, note: "" },

    // Migratory birds (statewide)
    { group: "Migratory birds", name: "American woodcock", zones: "all", ranges: [["2026-10-01", "2026-11-21"]], note: "HIP registration required." },
    { group: "Migratory birds", name: "Snipe", zones: "all", ranges: [["2026-09-01", "2026-12-15"]], note: "" },
    { group: "Migratory birds", name: "Sora and Virginia rail", zones: "all", ranges: [["2026-09-01", "2026-11-06"]], note: "" },
    { group: "Migratory birds", name: "Canada goose, early", zones: "all", ranges: [["2026-09-01", "2026-09-25"]], note: "" },

    // Waterfowl by waterfowl zone
    { group: "Waterfowl", name: "Ducks, mergansers, sea ducks", waterfowlZone: "Berkshire", zones: "all", ranges: [["2026-10-12", "2026-11-28"], ["2026-12-14", "2027-01-02"]], note: "Same dates for regular Canada goose, snow goose and coot." },
    { group: "Waterfowl", name: "Ducks, mergansers, sea ducks", waterfowlZone: "Central", zones: "all", ranges: [["2026-10-10", "2026-11-28"], ["2026-12-15", "2027-01-02"]], note: "Same dates for regular Canada goose, snow goose and coot." },
    { group: "Waterfowl", name: "Ducks, mergansers, sea ducks", waterfowlZone: "Coastal", zones: "all", ranges: [["2026-10-10", "2026-10-17"], ["2026-11-27", "2027-01-27"]], note: "Same dates for regular Canada goose, snow goose and coot." },
    { group: "Waterfowl", name: "Canada goose, late", waterfowlZone: "Berkshire", zones: "all", ranges: [["2026-12-15", "2027-02-13"]], note: "" },
    { group: "Waterfowl", name: "Canada goose, late", waterfowlZone: "Central", zones: "all", ranges: [["2027-01-16", "2027-02-13"]], note: "" },
    { group: "Waterfowl", name: "Canada goose, late", waterfowlZone: "Coastal", zones: "all", ranges: [["2027-01-28", "2027-02-13"]], note: "North coastal zone only." }
  ],

  rules: [
    { title: "Hunting hours", text: "Half an hour before sunrise to half an hour after sunset for deer and most game. Waterfowl and some furbearers differ." },
    { title: "No Sunday hunting", text: "Hunting is prohibited on Sundays in Massachusetts." },
    { title: "Blaze orange", text: "500 sq in on chest, back and head during the youth deer hunt, shotgun, primitive firearms, winter and early deer seasons, including in a blind. Archery deer hunters need an orange hat on WMAs stocked with pheasant or quail during that season." },
    { title: "Safety zones", text: "No hunting within 500 feet of an occupied dwelling or building without the owner’s or occupant’s permission. No discharging a firearm or releasing an arrow upon, across or within 150 feet of a paved or state highway." },
    { title: "Deer implements", text: "Shotgun no larger than 10 gauge in shotgun season only. Muzzleloaders .44–.775 caliber, single projectile. Bows at least 40 lb draw. Rifles and handguns may not be used or carried in the woods during shotgun deer season." },
    { title: "Baiting and scents", text: "Baiting deer is prohibited from 10 days before archery opens through the day after primitive season closes. Scents made from deer tissue or urine are now banned; synthetic lures only." },
    { title: "Tag and report", text: "Tag a deer immediately with the paper tag. Report within 48 hours on MassFishHunt or at a check station. Deer taken in the first week of shotgun season must go to a physical check station." },
    { title: "Licenses and stamps", text: "Archery stamp for archery season, primitive firearms stamp for primitive season. No stamp is needed for shotgun, winter or early seasons. Antlerless permits are zone-specific." }
  ]
};
