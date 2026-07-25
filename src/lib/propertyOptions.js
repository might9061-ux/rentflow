// Property feature catalogue used by the Add/Edit Property form and detail page.

export const PROPERTY_TYPES = ['Apartment block', 'Townhouse', 'Cluster house', 'Cottage', 'House', 'Commercial', 'Student housing', 'BnB / Lodge', 'Mixed use']

// In these types each dwelling is a standalone house, numbered "House 1…"; in the
// rest a tenant occupies a unit inside a block, numbered "Unit 1…".
export const HOUSE_TYPES = ['Cluster house', 'House', 'Townhouse', 'Cottage']
export const dwellingNoun = (type) => (HOUSE_TYPES.includes(type) ? 'House' : 'Unit')

// The ordered list of a property's dwellings: the manager's custom names when
// set, otherwise generated from the count ("House 1…" / "Unit 1…").
export const propertyUnitSlots = (prop) => {
  if (Array.isArray(prop?.unit_labels) && prop.unit_labels.length) return prop.unit_labels
  const noun = dwellingNoun(prop?.type)
  return Array.from({ length: Number(prop?.units) || 0 }, (_, i) => `${noun} ${i + 1}`)
}

export const FURNISHED = ['Unfurnished', 'Part-furnished', 'Furnished']

export const UTILITIES_INCLUDED = ['Water', 'Electricity', 'WiFi', 'Refuse', 'Levy']

// Amenities grouped for tick-boxes. Stored as a flat array of keys.
export const AMENITY_GROUPS = [
  {
    group: 'Utilities', items: [
      ['borehole', 'Borehole'], ['water_tank', 'Water tank (JoJo)'], ['municipal_water', 'Municipal water'],
      ['solar', 'Solar power'], ['inverter', 'Inverter / battery backup'], ['generator', 'Generator'],
      ['zesa_prepaid', 'ZESA prepaid'], ['wifi', 'Fibre / WiFi'], ['geyser', 'Geyser'],
    ],
  },
  {
    group: 'Security', items: [
      ['durawall', 'Durawall'], ['electric_fence', 'Electric fence'], ['auto_gate', 'Automated gate'],
      ['cctv', 'CCTV'], ['guard', 'Security guard'], ['alarm', 'Alarm system'],
    ],
  },
  {
    group: 'Comfort & extras', items: [
      ['parking', 'Parking / garage'], ['pool', 'Swimming pool'], ['garden', 'Garden / yard'],
      ['aircon', 'Air conditioning'], ['balcony', 'Balcony / veranda'], ['bic', 'Built-in cupboards'],
      ['tiled', 'Tiled floors'], ['cottage', "Servant's quarters"], ['pets', 'Pets allowed'],
      ['wheelchair', 'Wheelchair access'], ['laundry', 'Laundry'],
    ],
  },
]

const LABELS = Object.fromEntries(AMENITY_GROUPS.flatMap((g) => g.items))
export function amenityLabel(key) { return LABELS[key] || key }
