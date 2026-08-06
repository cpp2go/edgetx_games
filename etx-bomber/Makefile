DEST?=_site

all: lua

deps: node_modules/.bin/tstl

node_modules/.bin/tstl: package.json
	npm i

lua: deps
	node_modules/.bin/tstl
	mkdir -p $(DEST)/SCRIPTS
	mkdir -p $(DEST)/IMAGES
	mkdir -p $(DEST)/SOUNDS
	cp -f src/bomber.lua $(DEST)/SCRIPTS/Bomber.lua
	cp -f src/bomber-widget.lua $(DEST)/bomber.lua
	cp -f assets/*.png $(DEST)/IMAGES/
	cp -f assets/SOUNDS/*.wav $(DEST)/SOUNDS/

clean:
	rm -f package-lock.json
	rm -rf $(DEST) node_modules src/*.lua
