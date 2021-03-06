// TODO: edit marker is broken

jQuery(function($) {
    $.entwine('ss', function($) {

        $('.map-field-widget').entwine({
            Map: null,
            Features: null,
            Queue: null,
            IsMulti: false,
            getLayerType: function(layer) {
                switch (true) {
                    case layer instanceof L.Polygon: return 'Polygon';
                    case layer instanceof L.Polyline: return 'LineString';
                    case layer instanceof L.Marker: return 'Point';
                }
            },
            update: function() {
                const features = this.getFeatures().getLayers(), me = this;
                let ewkt = '', shapes = [];
                if (features.length) {
                    ewkt = 'SRID=' + this.data('defaultSrid');
                    ewkt += features.length > 1 ? ';MULTI' : ';';
                    ewkt += this.getLayerType(features[0]).toUpperCase();
                    ewkt += features.length > 1 ? '(' : '';
                    features.forEach(function(feature) {
                        shapes.push(me['to' + me.getLayerType(feature)](feature));
                    });
                    ewkt += shapes.join(',');
                    ewkt += features.length > 1 ? ')' : '';
                }
                this.getFormField().val(ewkt);
            },
            fromLatLng: function(latLng) {
                return this.data('defaultSrid') == '4326'
                    ? [latLng.lng, latLng.lat]
                    : proj4('EPSG:' + this.data('defaultSrid')).forward([latLng.lng, latLng.lat]);
            },
            toPoint: function(point) {
                var coords = this.fromLatLng(point.getLatLng());

                return '(' + coords[0] + ' ' + coords[1] + ')';
            },
            toLineString: function(line) {
                var points = [], me = this;

                line.getLatLngs().forEach(function(point){
                    point = me.fromLatLng(point);
                    points.push(point[0] + ' ' + point[1]);
                });

                return '(' + points.join(',') + ')';
            },
            toPolygon: function(polygon) {
                var rings = [], me = this;

                polygon.getLatLngs().forEach(function(ring){

                    var points = [];
                    ring.forEach(function(point, r){
                        point = me.fromLatLng(point);
                        points.push(point[0] + ' ' + point[1]);
                    });

                    // close un-closed polygons
                    if (points[0] != points[points.length - 1]) points.push(points[0]);

                    rings.push('(' + points.join(',') + ')')
                });

                return '(' + rings.join(',') + ')';
            },
            onmatch: function() {

                this.getFormField().attr('readonly', 'readonly');

                var me = this;

                var map = L.map(this[0], { worldCopyJump: true, maxBoundsViscosity: 1.0 });
                var streets = L.tileLayer('//{s}.tile.osm.org/{z}/{x}/{y}.png').addTo(map);
                var satelite = L.tileLayer('//{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
                    maxZoom: 20,
                    subdomains: ['mt0', 'mt1', 'mt2', 'mt3']
                });

                var baseMaps = {
                    "Streets": streets,
                    "Satelite": satelite
                };

                var feature = this.getFeatureFromFormFieldValue();
                var drawnItems = new L.FeatureGroup(feature ? [feature] : []);
                me.setFeatures(drawnItems);

                if (!this.getFormField().hasClass('mapfield_readonly')) {
                    var drawControl = new L.Control.Draw({
                        draw: this.data('controls'),
                        edit: {
                            featureGroup: drawnItems
                        }
                    });
                    map.addControl(drawControl);
                }
                map.addLayer(drawnItems);

                map.addControl(new L.Control.Search({
                    url: '//nominatim.openstreetmap.org/search?format=json&q={s}',
                    jsonpParam: 'json_callback',
                    propertyName: 'display_name',
                    propertyLoc: [
                        'lat', 'lon'
                    ],
                    marker: false,
                    autoCollapse: true,
                    autoType: false,
                    minLength: 2
                }));

                L.control.layers(baseMaps).addTo(map);

                map
                    .on(L.Draw.Event.CREATED, function(e) {
                        if (
                            me.data('multiEnabled')
                            && drawnItems.getLayers().length
                            && me.getLayerType(e.layer) == me.getLayerType(drawnItems.getLayers()[0])
                        ) {
                            drawnItems.addLayer(e.layer);
                        } else {
                            drawnItems.clearLayers().addLayer(e.layer);
                        }
                        me.update();
                    })
                    .on(L.Draw.Event.EDITED, function () { me.update(); })
                    .on(L.Draw.Event.DELETED, function () { me.update(); });

                this.setMap(map);

                if (!feature) {
                    map.setView(this.data('defaultLocation'), 13);
                } else if (feature.getBounds) {
                    map.fitBounds(feature.getBounds());
                } else if (feature.getLatLng) {
                    map.setView(feature.getLatLng(), 13);
                }
            },
            getFormField: function() {
                return $('#' + $(this).data('field'));
            },
            getFeatureFromFormFieldValue: function() {
                var wkt = this.getFormField().val(),
                    parts = wkt.match(/^srid=(\d+);(point|linestring|polygon|multipoint|multilinestring|multipolygon)\(([-\d\.\s\(\),]+)\)/i),
                    srid, proj, type, json, coordinates;

                if (!parts) return null;

                srid = parts[1];
                proj = srid != '4326'
                    ? proj4('EPSG:' + srid)
                    : false;
                type = parts[2].toUpperCase();

                json = '[' + parts[3].replace(/([\d\.-]+)\s+([\d\.-]+)/g, function(p, c1, c2) {
                    if (srid != '4326') {
                        coords = proj.inverse([c1, c2]);
                        return '[' + coords[1] + ',' + coords[0] + ']';
                    } else {
                        return '[' + c2 + ',' + c1 + ']';
                    }
                }).replace(/([\(\)])/g, function(p, c) {
                    return c == '('
                        ? '['
                        : ']';
                }) + ']';

                coordinates = JSON.parse(json);

                switch (type) {
                    case 'POINT': return L.marker(coordinates[0]);
                    case 'LINESTRING': return L.polyline(coordinates);
                    case 'POLYGON': return L.polygon(coordinates[0]);
                    case 'MULTIPOINT': return L.marker(coordinates);
                    case 'MULTILINESTRING': return L.polyline(coordinates[0]);
                    case 'MULTIPOLYGON': return L.polygon(coordinates);
                }
            },
            center: function() {
                if (this.getFeatures() && this.getFeatures().getLayers().length) {
                    this.getMap().flyTo(this.getFeatures().getBounds().getCenter());
                }
            },
            onmouseover: function() {
                var queue = this.getQueue(),
                    map = this.getMap(),
                    timer = setInterval(function() {
                        map.invalidateSize();
                    }, 5);
                setTimeout(function() {
                    clearInterval(timer)
                }, 1000);
                if (queue) clearTimeout(queue);
            },
            onmouseout: function() {
                var me = this,
                    map = this.getMap(),
                    queue = setTimeout(function () {
                        var timer = setInterval(function() {
                                map.invalidateSize()
                            }, 5);
                        setTimeout(function() {
                            clearInterval(timer)
                            me.center();
                        }, 1000);
                    }, 100);
                this.setQueue(queue);
            }
        });

    });
});
