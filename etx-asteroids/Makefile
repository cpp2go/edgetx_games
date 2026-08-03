DEST?=_site

all: lua

deps: node_modules/.bin/tstl

node_modules/.bin/tstl: package.json
	npm i

lua: deps
	node_modules/.bin/tstl
	mkdir -p $(DEST)/SCRIPTS
	mkdir -p $(DEST)/IMAGES
	cp -f src/asteroids.lua $(DEST)/SCRIPTS/Asteroids.lua
	cp -f src/asteroids-widget.lua $(DEST)/asteroids.lua

clean:
	rm -f package-lock.json
	rm -rf $(DEST) node_modules src/*.lua
