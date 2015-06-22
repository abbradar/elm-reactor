module SideBar.Watches where

import Html exposing (..)
import Html.Attributes exposing (..)
import Markdown


view : List (String, String) -> Html
view watches =
  div viewAttributes <|
      case watches of
        [] -> [noWatches]
        _ -> List.map viewWatch watches


viewAttributes : List Attribute
viewAttributes =
  [ style
    [ ("overflow-y", "auto")
    , ("overflow-x", "hidden")
    , ("height", "100%")
    , ("padding", "0 20px")
    ]
  ]



-- WATCHES

viewWatch : (String, String) -> Html
viewWatch (name, value) =
  div watchAttributes [viewName name, viewValue value]


watchAttributes : List Attribute
watchAttributes =
  [ style
    [ ("color", "rgb(228, 228, 228)")
    ]
  ]


viewName : String -> Html
viewName name =
  div nameAttributes [ text name ]


nameAttributes : List Attribute
nameAttributes =
  [ style
    [ ("margin", "20px 0 10px")
    , ("font-weight", "bold")
    , ("font-family", "Gotham, Futura, 'Lucida Grande', sans-serif")
    ]
  ]


viewValue : String -> Html
viewValue value =
  pre valueAttributes [ text value ]


valueAttributes : List Attribute
valueAttributes =
  [ style
    [ ("margin", "0 0 0 10px")
    ]
  ]


-- NO WATCHES

noWatches : Html
noWatches = Markdown.toHtml """

### You don't have any watches!

Use [Debug.watch][watch] to show any value. <br>
`watch : String -> a -> a`

Use [Debug.watchSummary][watchSummary] to show a summary or subvalue of any value.

[watch]: http://package.elm-lang.org/packages/elm-lang/core/latest/Debug#watch
[watchSummary]: http://package.elm-lang.org/packages/elm-lang/core/latest/Debug#watchSummary

"""
