module SideBar.Controls where

import Color
import FontAwesome as FA
import Html exposing (..)
import Html.Attributes as Attr exposing (..)
import Html.Events exposing (on)
import Json.Decode exposing (at, int)
import Json.Encode as Json


-- VIEW

view : Signal.Address Action -> Model -> Html
view address model =
  div []
    [ FA.play (Color.rgb 170 170 170) 30
    , slider address model
    ]


slider : Signal.Address Action -> Model -> Html
slider address model =
  input
    [ type' "range"
    , Attr.min (toString 0)
    , Attr.max (toString model.total)
    , value (toString model.index)
    , on "change"
        (at ["target","value"] int)
        (Signal.message address << Scrub)
    ]
    []
