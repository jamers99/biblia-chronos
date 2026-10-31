# Basemap geography

Coastlines, lakes, and rivers for the map, cut down from
[Natural Earth](https://www.naturalearthdata.com/) 1:10m data (public domain),
via the GeoJSON copies in
[nvkelso/natural-earth-vector](https://github.com/nvkelso/natural-earth-vector/tree/master/geojson).

| File | Source | Notes |
|---|---|---|
| `land.json` | `ne_10m_land` | |
| `lakes.json` | `ne_10m_lakes` | modern reservoirs dropped (no Lake Nasser in Moses' day) |
| `rivers.json` | `ne_10m_rivers_lake_centerlines` | major rivers only (`scalerank <= 7`), canals dropped |

All three are clipped to the biblical world (lng −12…80, lat 4…50), simplified,
and rounded to 0.01° (~1 km). They're written with clockwise outer rings
(`gj2008`), which is the winding d3-geo expects. RFC 7946 winding would make
d3 fill the whole globe *except* the land.

To regenerate, download the three source files and run
[mapshaper](https://github.com/mbloch/mapshaper) (no install needed):

```sh
M="npx -y mapshaper@0.6"; BB="bbox=-12,4,80,50"; O="format=geojson gj2008 precision=0.01"
$M ne_10m_land.geojson -clip $BB -simplify 15% keep-shapes -drop fields='*' -o $O land.json
$M ne_10m_lakes.geojson -filter 'featurecla != "Reservoir"' -clip $BB -simplify 15% keep-shapes -filter-fields name -o $O lakes.json
$M ne_10m_rivers_lake_centerlines.geojson -filter 'scalerank <= 7 && !/Canal/.test(name)' -clip $BB -simplify 15% -filter-fields name -o $O rivers.json
```
