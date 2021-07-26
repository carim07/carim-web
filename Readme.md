# My personal website carim.ar

Personal website created using [hugo](https://gohugo.io/) and [LoveIt](https://hugoloveit.com/) theme.

## Requisites

* [Hugo](https://gohugo.io/)

## Build

To build, do
```
hugo --theme=LoveIt
```

## Deployment

The deployment is done automatically via [GitHub Actions](https://github.com/features/actions).

Configuration of the pipeline is present in `.github/workflows/main.yml`.

Deployment configuration is included in `config.toml` in the `[Deployment]` section.